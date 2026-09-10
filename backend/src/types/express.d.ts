declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      createdAt?: Date;
    }

    interface Request {
      /** Set by the `requireAuth` middleware; read through `currentUser`. */
      user?: User;

      /**
       * Output of the `validate` middleware. `query` and `params` are getters
       * on Express 5 and cannot be reassigned, so parsed values land here.
       */
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
