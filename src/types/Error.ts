export class ErrorTemplate extends Error {
    constructor(e?: string) {
        super(e);
        this.name = new.target.name;
    }

    toString(): string {
        return this.message ? `${this.name}: ${this.message}` : `${this.name}`;
    }
}

export class DownloadTimeOutError extends ErrorTemplate { }
export class UserCancelledError extends ErrorTemplate { }
export class CalculateUnfinishedError extends ErrorTemplate { }
export class GenerateError extends ErrorTemplate { }
export class NotOpenTextDocumentError extends ErrorTemplate { }
export class ParsingError extends ErrorTemplate { }
export class UnimplementedError extends ErrorTemplate { }
export class TypeUnmatchError extends ErrorTemplate { }