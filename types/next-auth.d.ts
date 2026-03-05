import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: string | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string | null;
  }
}
