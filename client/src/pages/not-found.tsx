import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center text-center space-y-6 max-w-md">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
          <FileQuestion className="w-12 h-12 text-muted-foreground" />
        </div>
        
        <h1 className="text-4xl font-bold font-display tracking-tight">404 Page Not Found</h1>
        <p className="text-muted-foreground text-lg">
          The file or folder you are looking for might have been moved, deleted, or you may not have permission to view it.
        </p>

        <Link href="/">
          <Button size="lg" className="gap-2">
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
