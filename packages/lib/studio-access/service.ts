// Studio access use cases over its ports. No database or framework code, so
// it runs on any store (tests use in-memory fakes, ./service.test.ts).
// Callers check who's asking and parse the input first (./actions.ts): every
// method takes the caller's own studio id, never one sent by the browser
// (the boss's review takes the studio being reviewed).

import {
  afterDecision,
  afterWrongPassword,
  CODE_MAX_TRIES,
  CODE_MINUTES,
  deviceUnlock,
  isLocked,
  isSettingUp,
  LOGO_MAX_BYTES,
  maskEmail,
  missingForSubmit,
  needsReason,
  passwordProblem,
  RESEND_SECONDS,
  resendWait,
  type DeviceUnlock,
  type EmailCode,
  type ReviewDecision,
  type StudioAccess,
  type StudioDetails,
  type StudioForReview,
} from "./core";
import { AccessError, type AccessSecrets, type AccessStore, type LogoFiles, type Mailer, type OwnerNotifier } from "./ports";

export interface AccessLinks {
  /** The studio workspace, for emails and notifications. */
  workspace: string;
}

const minutesLeft = (until: string, now: Date) => Math.max(1, Math.ceil((Date.parse(until) - now.getTime()) / 60_000));

export class StudioAccessService {
  constructor(
    private readonly store: AccessStore,
    private readonly mailer: Mailer,
    private readonly secrets: AccessSecrets,
    private readonly files: LogoFiles,
    private readonly notifier: OwnerNotifier,
    private readonly links: AccessLinks,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async access(tenantId: string): Promise<StudioAccess> {
    const access = await this.store.get(tenantId);
    if (!access) throw new AccessError("That studio doesn't exist.");
    return access;
  }

  /** The studio, if its owner may still change the set-up details. */
  private async settingUp(tenantId: string): Promise<StudioAccess> {
    const access = await this.access(tenantId);
    if (isSettingUp(access.status)) return access;
    throw new AccessError(
      access.status === "in_review"
        ? "Your studio is being reviewed, so it can't be changed right now."
        : "Your studio is already set up: change it from Studio profile.",
    );
  }

  // ── Onboarding ──

  async saveDetails(tenantId: string, details: StudioDetails): Promise<void> {
    await this.settingUp(tenantId);
    await this.store.saveDetails(tenantId, details);
  }

  /** A signed link the browser uploads the (already shrunk) logo to. */
  async startLogoUpload(tenantId: string): Promise<{ key: string; url: string }> {
    await this.access(tenantId);
    const key = `incoming/logos/${tenantId}/${this.secrets.newId()}.jpg`;
    return { key, url: await this.files.putUrl(key, "image/jpeg", 600) };
  }

  /** Checks the uploaded logo and makes it the studio's; the old one is deleted. */
  async confirmLogo(tenantId: string, key: string): Promise<void> {
    await this.access(tenantId);
    if (!key.startsWith(`incoming/logos/${tenantId}/`)) throw new AccessError("That upload isn't valid.");
    const size = await this.files.size(key);
    if (size === null) throw new AccessError("The logo didn't arrive. Try uploading it again.");
    if (size === 0 || size > LOGO_MAX_BYTES) {
      await this.files.remove([key]);
      throw new AccessError("That logo is too large. Try a smaller picture.");
    }
    const final = `studios/${tenantId}/logo-${this.secrets.newId()}.jpg`;
    await this.files.move(key, final);
    const old = await this.store.setLogo(tenantId, final);
    if (old) await this.files.remove([old]);
  }

  /** A short-lived link to show a logo (the bucket is private). Null when there's none or storage is unreachable: pages fall back to initials. */
  async logoUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.files.getUrl(key, 3600);
    } catch (error) {
      console.error("studio-access: logo link failed", error);
      return null;
    }
  }

  /** Emails a code to verify the owner's address. */
  async sendVerifyCode(tenantId: string, email: string): Promise<{ sentTo: string; resendIn: number }> {
    const access = await this.settingUp(tenantId);
    await this.sendCode(access, "verify", email);
    return { sentTo: email, resendIn: RESEND_SECONDS };
  }

  async verifyEmail(tenantId: string, code: string): Promise<void> {
    await this.settingUp(tenantId);
    const email = await this.useCode(tenantId, "verify", code);
    await this.store.setOwnerEmail(tenantId, email, this.now().toISOString());
  }

  /** Sets the studio password during set-up. Returns what this device's unlock needs. */
  async setPassword(tenantId: string, password: string): Promise<DeviceUnlock> {
    const access = await this.settingUp(tenantId);
    return this.storePassword(access, password);
  }

  /** Sends the studio for the boss's review, once every step is done. */
  async submit(tenantId: string): Promise<void> {
    const access = await this.settingUp(tenantId);
    const missing = missingForSubmit(access);
    if (missing.length) throw new AccessError(`Before you submit, add ${missing.join(", ")}.`);
    if (!(await this.store.setStatus(tenantId, access.status, "in_review", this.now().toISOString(), null))) {
      throw new AccessError("Your studio was just changed. Refresh the page.");
    }
  }

  // ── The studio password ──

  /** Checks the password; 5 wrong in a row lock the studio for 15 minutes. Returns this device's unlock. */
  async unlock(tenantId: string, password: string): Promise<DeviceUnlock> {
    const access = await this.access(tenantId);
    const now = this.now();
    if (!access.passwordHash) throw new AccessError("Set a studio password first.");
    if (isLocked(access.passwordLockedUntil, now)) {
      throw new AccessError(`Too many wrong passwords. Try again in ${minutesLeft(access.passwordLockedUntil!, now)} minutes, or reset it.`);
    }
    if (!(await this.secrets.verifyPassword(password, access.passwordHash))) {
      const next = afterWrongPassword(access.passwordFailedAttempts, now);
      await this.store.recordWrongPassword(tenantId, next.failedAttempts, next.lockedUntil);
      throw new AccessError(
        next.lockedUntil ? "Too many wrong passwords. The studio is locked for 15 minutes." : "That password is wrong.",
      );
    }
    if (access.passwordFailedAttempts > 0) await this.store.clearWrongPasswords(tenantId);
    return deviceUnlock(access, now);
  }

  /** Emails a reset code to the owner's verified address. */
  async sendResetCode(tenantId: string): Promise<{ sentTo: string; resendIn: number }> {
    const access = await this.access(tenantId);
    if (!access.ownerEmail || !access.ownerEmailVerifiedAt) {
      throw new AccessError("Your studio has no verified email yet. Contact Aming to reset the password.");
    }
    await this.sendCode(access, "reset", access.ownerEmail);
    return { sentTo: maskEmail(access.ownerEmail), resendIn: RESEND_SECONDS };
  }

  /** A new password from an emailed code. Every other device is signed out; this one is unlocked. */
  async resetPassword(tenantId: string, code: string, password: string): Promise<DeviceUnlock> {
    const access = await this.access(tenantId);
    const problem = passwordProblem(password, [access.name, access.phone ?? ""]);
    if (problem) throw new AccessError(problem);
    await this.useCode(tenantId, "reset", code);
    const unlock = await this.storePassword(access, password);
    await this.tell(access, {
      subject: "Your studio password was changed",
      text: `The password for ${access.name} was just changed, and every other device was signed out.\n\nIf this wasn't you, reset it again at ${this.links.workspace} and contact Aming.`,
    });
    return unlock;
  }

  // ── The boss's review ──

  async forReview(): Promise<StudioForReview[]> {
    return Promise.all((await this.store.forReview()).map(async (s) => ({ ...s, logoUrl: await this.logoOf(s.tenantId) })));
  }

  async reviewOne(tenantId: string): Promise<StudioForReview | null> {
    const studio = await this.store.reviewOne(tenantId);
    return studio && { ...studio, logoUrl: await this.logoOf(tenantId) };
  }

  /** Approves, sends back (with a reason) or suspends (with a reason) a studio, and tells its owner. */
  async review(tenantId: string, decision: ReviewDecision, note: string): Promise<void> {
    const access = await this.access(tenantId);
    const to = afterDecision(access.status, decision);
    if (!to) {
      throw new AccessError(
        decision === "suspend" ? "This studio is already suspended." : "This studio isn't waiting for a review.",
      );
    }
    const reason = needsReason(decision) ? note.trim() : null;
    if (needsReason(decision) && !reason) throw new AccessError("Tell the studio why, so they know what to do.");
    if (!(await this.store.setStatus(tenantId, access.status, to, this.now().toISOString(), reason))) {
      throw new AccessError("Someone else just reviewed this studio. Refresh the page.");
    }

    const message = {
      approve: {
        title: `${access.name} is approved`,
        body: "Your studio is open: your public page is live and your clients can sign in.",
      },
      send_back: { title: `${access.name} needs a few changes`, body: `Aming asks: ${reason}` },
      suspend: { title: `${access.name} is suspended`, body: `Aming says: ${reason}` },
    }[decision];
    await this.notifier.notify(access.ownerClientId, { ...message, url: this.links.workspace });
    await this.tell(access, {
      subject: message.title,
      text: `${message.body}\n\nOpen your studio: ${this.links.workspace}`,
    });
  }

  // ── Internals ──

  private async logoOf(tenantId: string): Promise<string | null> {
    return this.logoUrl((await this.store.get(tenantId))?.logoKey ?? null);
  }

  private async storePassword(access: StudioAccess, password: string): Promise<DeviceUnlock> {
    const problem = passwordProblem(password, [access.name, access.phone ?? ""]);
    if (problem) throw new AccessError(problem);
    const at = this.now().toISOString();
    await this.store.setPassword(access.tenantId, await this.secrets.hashPassword(password), at);
    return deviceUnlock({ tenantId: access.tenantId, passwordSetAt: at }, this.now());
  }

  private async sendCode(access: StudioAccess, purpose: EmailCode["purpose"], email: string): Promise<void> {
    const now = this.now();
    const pending = await this.store.code(access.tenantId, purpose);
    const wait = resendWait(pending?.sentAt ?? null, now);
    if (wait > 0) throw new AccessError(`Wait ${wait} seconds before asking for another code.`);

    const code = this.secrets.newCode();
    await this.store.saveCode({
      tenantId: access.tenantId,
      purpose,
      email,
      codeHash: this.secrets.hashCode(access.tenantId, purpose, code),
      attempts: 0,
      sentAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString(),
    });
    const what = purpose === "verify" ? "verify this email for" : "reset the password of";
    await this.mailer.send({
      to: email,
      subject: `${code} is your ${access.name} code`,
      text: `Your code to ${what} ${access.name} on Aming is:\n\n${code}\n\nIt works for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
    });
  }

  /** Checks a code (10 minutes, 5 tries) and uses it up. Returns the email it was sent to. */
  private async useCode(tenantId: string, purpose: EmailCode["purpose"], code: string): Promise<string> {
    const pending = await this.store.code(tenantId, purpose);
    if (!pending) throw new AccessError("Ask for a code first.");
    if (Date.parse(pending.expiresAt) <= this.now().getTime()) {
      await this.store.deleteCode(tenantId, purpose);
      throw new AccessError("That code has expired. Ask for a new one.");
    }
    if (!this.secrets.sameHash(this.secrets.hashCode(tenantId, purpose, code), pending.codeHash)) {
      const attempts = pending.attempts + 1;
      if (attempts >= CODE_MAX_TRIES) {
        await this.store.deleteCode(tenantId, purpose);
        throw new AccessError("Too many wrong codes. Ask for a new one.");
      }
      await this.store.setCodeAttempts(tenantId, purpose, attempts);
      throw new AccessError("That code is wrong. Check the email and try again.");
    }
    await this.store.deleteCode(tenantId, purpose);
    return pending.email;
  }

  /** Emails the owner, when they have a verified address. Best effort: never undoes what happened. */
  private async tell(access: StudioAccess, email: { subject: string; text: string }): Promise<void> {
    if (!access.ownerEmail || !access.ownerEmailVerifiedAt) return;
    try {
      await this.mailer.send({ to: access.ownerEmail, ...email });
    } catch (error) {
      console.error("studio-access: email failed", error);
    }
  }
}
