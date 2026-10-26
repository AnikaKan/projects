export interface ExperimentOSClientOptions {
  baseUrl: string;
  serviceCredential: string;
}

/**
 * Day 1 client shell. Assignment behavior is deliberately deferred to Day 2.
 */
export class ExperimentOSClient {
  readonly baseUrl: string;
  readonly #serviceCredential: string;

  constructor(options: ExperimentOSClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#serviceCredential = options.serviceCredential;
  }

  async health(signal?: AbortSignal): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/health/live`, { signal });
    return response.ok;
  }

  /** Reserved for authenticated Day 2 and Day 3 requests. */
  protected authorizationHeader(): string {
    return `Bearer ${this.#serviceCredential}`;
  }
}
