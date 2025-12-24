import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  Folder, 
  Clock, 
  Trash2, 
  Users, 
  ShieldAlert, 
  Settings, 
  LogOut, 
  Search,
  Menu,
  FileText
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function LayoutShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";

  const navigation = [
    { name: "My Files", href: "/", icon: Folder },
    { name: "Recent", href: "/recent", icon: Clock },
    { name: "Trash", href: "/trash", icon: Trash2 },
    ...(isAdmin ? [
      { name: "User Management", href: "/admin/users", icon: Users },
      { name: "Audit Logs", href: "/admin/audit", icon: ShieldAlert },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-6">
          <div className="flex items-center gap-2 font-display text-xl font-bold text-primary">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            CorpDrive
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} className={`
                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"}
              `}>
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </div>
      </div>

      {/* Mobile Drawer */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" className="md:hidden absolute top-4 left-4 z-50">
            <Menu className="w-6 h-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="p-6">
            <div className="flex items-center gap-2 font-display text-xl font-bold text-primary">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              CorpDrive
            </div>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {navigation.map((item) => (
              <Link key={item.name} href={item.href} className={`
                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                ${location === item.href 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"}
              `}>
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card px-8 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              className="pl-10 bg-muted/50 border-transparent focus:bg-background focus:border-primary w-full transition-all"
            />
          </div>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {user?.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.username}</p>
                    <p className="text-xs leading-none text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logoutMutation.mutate()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-muted/20 p-8">
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
