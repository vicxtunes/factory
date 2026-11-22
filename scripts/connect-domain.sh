#!/usr/bin/env bash
# Connect a Pro business's own domain on the server (owner, 2026-11-22).
# The business asked for it on My Business → Pro & page look and added the
# DNS record (A → the server). This gives the server a site for it in Nginx
# and a Let's Encrypt certificate; the client app (proxy.ts) then shows the
# business's page there once the boss taps "It's on" (dashboard → Studios).
#
#   scripts/connect-domain.sh salon.com          connect
#   scripts/connect-domain.sh --remove salon.com take it off the server
#
# Runs over `ssh aming`. Certificates renew with the others (certbot.timer).
set -euo pipefail

remove=false
if [[ "${1:-}" == "--remove" ]]; then remove=true; shift; fi
domain="${1:-}"
if [[ ! "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$ ]]; then
  echo "usage: $0 [--remove] domain.com (lowercase, no https://)" >&2
  exit 1
fi
site="/etc/nginx/sites-available/domain-$domain"
enabled="/etc/nginx/sites-enabled/domain-$domain"

if $remove; then
  ssh aming "rm -f '$enabled' '$site' && nginx -t && systemctl reload nginx"
  echo "Removed $domain from Nginx (its certificate stays until it expires: certbot delete --cert-name $domain to drop it)."
  exit 0
fi

ip="$(dig +short A "$domain" | tail -n1)"
if [[ "$ip" != "46.101.15.110" ]]; then
  echo "$domain points to '${ip:-nothing}', not 46.101.15.110: the business hasn't added the record yet (or it hasn't spread)." >&2
  exit 1
fi

# 1. Port 80 only, to answer Let's Encrypt's check.
ssh aming "cat > '$site' <<CONF
# A Pro business's own domain (scripts/connect-domain.sh).
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\\\$host\\\$request_uri; }
}
CONF
ln -sf '$site' '$enabled' && nginx -t && systemctl reload nginx"

# 2. The certificate (the account already set up for Aming's own).
ssh aming "certbot certonly --webroot -w /var/www/html -d '$domain' --non-interactive --keep-until-expiring"

# 3. HTTPS to the client app.
ssh aming "cat >> '$site' <<CONF

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $domain;
    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;
    access_log /var/log/nginx/aming.log aming;
    location / { proxy_pass http://aming_client; include snippets/aming-proxy.conf; }
}
CONF
nginx -t && systemctl reload nginx"

echo "$domain is connected on the server. Now tap \"It's on\" for it on the dashboard (Studios → Own domains)."
