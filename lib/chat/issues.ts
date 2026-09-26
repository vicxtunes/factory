import "server-only";

// Public, server-only API for other modules that own something discussed in
// chat. lib/support uses it to give each support report a private thread.
// Callers must do their own authorisation first: these functions trust
// their input.

export {
  announceIssueStatus,
  createIssueThread,
  issueThreadIds,
  joinIssueThread,
  removeIssueThreadFiles,
  type IssueThreadInput,
} from "./server/service";
