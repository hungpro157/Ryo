export class PlannerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlannerError';
    this.code = code;
    this.details = details;
  }
}
