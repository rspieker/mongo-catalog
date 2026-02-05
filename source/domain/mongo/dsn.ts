const pattern = /^(?:([^:]+):\/\/)?(?:([^\/]+))?(?::(\d+))?(?:\/([^\/]+))?(?:\/(\w+))?$/

export class DSN {
    readonly #parts: [string, string, string, string, string];

    constructor(dsn: string = '') {
        if (!pattern.test(dsn)) {
            throw new Error(`Invalid DSN: "${dsn}"`);
        }

        const [, proto = 'mongodb', host = '127.0.0.1', port = '27017', name = 'MongoCatalog', collection = 'CatalogCollection'] = dsn.match(pattern) as RegExpMatchArray;
        this.#parts = [proto, host, port, name, collection];
    }

    get proto(): string {
        return this.#parts[0];
    }

    get host(): string {
        return this.#parts[1];
    }

    get port(): number {
        return Number(this.#parts[2]);
    }

    get name(): string {
        return this.#parts[3];
    }

    get collection(): string {
        return this.#parts[4];
    }

    get url(): string {
        return `${this.proto}://${this.host}:${this.port}`;
    }

    toString(): string {
        return `${this.url}/${this.collection}`;
    }
}