import { EmptyState } from "../components/ui/States";

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      message="The page you're looking for doesn't exist."
      action={{ href: "/search", label: "Back to search" }}
    />
  );
}