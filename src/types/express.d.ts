import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    auth?:
      | { kind: "customer"; customerId: string; sessionId: string }
      | { kind: "admin"; adminUserId: string; sessionId: string; roleNames: string[]; permissionKeys: string[] };
  }
}
