'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, LogOut, Menu, Moon, Sun, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/lib/auth/session';
import { NAV_ITEMS } from '@/lib/nav/items';
import { cn } from '@/lib/utils/cn';
import { initialsOf } from '@/lib/utils/format';

/**
 * The authenticated frame: fixed sidebar from `lg` up, a slide-over drawer below it.
 *
 * One nav definition renders both (lib/nav/items.ts), filtered against the caller's permissions —
 * which hides links but never protects routes; the API refuses a forced URL regardless (AD-5).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="bg-card hidden w-60 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Dumbbell className="text-primary h-5 w-5" aria-hidden />
          <span className="font-semibold">GymOS</span>
          <span className="text-muted-foreground text-xs">Super Admin</span>
        </div>
        <NavLinks className="flex-1 space-y-1 p-3" />
      </aside>

      {/* Mobile drawer */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="inset-x-0 inset-y-0 h-dvh max-h-none w-72 translate-x-0 translate-y-0 rounded-none border-r p-0 sm:top-0 sm:left-0 sm:max-w-none">
          <DialogTitle className="flex h-14 items-center gap-2 border-b px-4 text-base">
            <Dumbbell className="text-primary h-5 w-5" aria-hidden />
            GymOS Super Admin
          </DialogTitle>
          {/* Navigating closes the drawer at the click itself — leaving it open over the new page is
              the classic mobile-nav bug. */}
          <NavLinks className="space-y-1 p-3" onNavigate={() => setDrawerOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenDrawer={() => setDrawerOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLinks({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useSession();

  return (
    <nav className={className} aria-label="Main">
      {NAV_ITEMS.filter((item) => !item.permission || can(item.permission)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Topbar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { user, signOut } = useSession();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="bg-background/95 sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme"
      >
        <Sun className="h-5 w-5 dark:hidden" />
        <Moon className="hidden h-5 w-5 dark:block" />
      </Button>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium"
              aria-label="Account menu"
            >
              {initialsOf(user.firstName, user.lastName)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal">
              <p className="font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-muted-foreground text-xs">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account/password">
                <UserRound className="h-4 w-4" aria-hidden />
                Change password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
