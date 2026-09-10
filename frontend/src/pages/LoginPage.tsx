import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuthStore } from "../stores/auth.store";
import { Loader2 } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Login failed");
      }

      setAuth(data.user, data.accessToken);
      navigate("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 bg-background-1 p-8 rounded-2xl border border-white/5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
          <p className="mt-2 text-xs text-zinc-400">
            Don't have an account?{" "}
            <Link to="/register" className="text-accent-primary hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="block w-full rounded-xl border border-white/10 px-3.5 py-2.5 text-sm text-zinc-100 bg-background-2 focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 outline-none transition-all placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="block w-full rounded-xl border border-white/10 px-3.5 py-2.5 text-sm text-zinc-100 bg-background-2 focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 outline-none transition-all placeholder:text-zinc-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent-primary text-white font-medium hover:opacity-90 disabled:opacity-50 text-sm transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-accent-primary/20 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}