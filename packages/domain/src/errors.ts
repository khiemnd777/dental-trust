export class DomainRuleError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, string>> | undefined;

  constructor(code: string, message: string, details?: Readonly<Record<string, string>>) {
    super(message);
    this.name = 'DomainRuleError';
    this.code = code;
    this.details = details;
  }
}

export class InvalidStateTransitionError extends DomainRuleError {
  constructor(workflow: string, from: string, to: string) {
    super('INVALID_STATE_TRANSITION', `Cannot transition ${workflow} from ${from} to ${to}.`, {
      workflow,
      from,
      to,
    });
    this.name = 'InvalidStateTransitionError';
  }
}
