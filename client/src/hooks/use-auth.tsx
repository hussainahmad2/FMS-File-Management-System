import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, LoginRequest } from "@shared/schema";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: ReturnType<typeof useLoginMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useLoginMutation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return await res.json();
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData([api.auth.me.path], user);
      toast({
        title: "Welcome back",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useLogoutMutation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(api.auth.logout.path, { method: api.auth.logout.method });
    },
    onSuccess: () => {
      queryClient.setQueryData([api.auth.me.path], null);
      toast({
        title: "Logged out",
        description: "See you next time",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return await res.json();
    },
  });

  const loginMutation = useLoginMutation();
  const logoutMutation = useLogoutMutation();

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
