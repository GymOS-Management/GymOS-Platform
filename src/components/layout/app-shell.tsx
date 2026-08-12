'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Dumbbell,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserRound,
} from 'lucide-react';
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
import { NAV_ITEMS, isVisible } from '@/lib/nav/items';
import { cn } from '@/lib/utils/cn';
import { initialsOf } from '@/lib/utils/format';

/**
 * The authenticated frame: a sticky, full-height sidebar from `lg` up, a slide-over drawer below it.
 *
 * One nav definition renders both (lib/nav/items.ts), filtered against the caller's permissions —
 * which hides links but never protects routes; the API refuses a forced URL regardless (AD-5).
 */
/**
 * Where the desktop sidebar's collapsed state is remembered, so it survives a reload rather than
 * springing back open every time the operator returns.
 */
const SIDEBAR_STORAGE_KEY = 'gymos:sidebar-collapsed';

/** Same-tab notifications; `storage` only fires in the *other* tabs. */
const SIDEBAR_CHANGED_EVENT = 'gymos:sidebar-changed';

function subscribeToSidebarPreference(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(SIDEBAR_CHANGED_EVENT, onChange);

  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SIDEBAR_CHANGED_EVENT, onChange);
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * Read through `useSyncExternalStore` rather than as state seeded in an effect.
   *
   * `localStorage` is an external store, and this is the hook built for exactly that: it takes a
   * separate server snapshot (open), so the server and the first client render agree and there is no
   * hydration mismatch — and it re-reads on the `storage` event, so collapsing the sidebar in one
   * tab collapses it in the others rather than leaving them disagreeing with what is saved.
   */
  const sidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    () => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
    () => false,
  );

  const toggleSidebar = () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!sidebarCollapsed));
    window.dispatchEvent(new Event(SIDEBAR_CHANGED_EVENT));
  };

  return (
    <div className="flex min-h-dvh">
      {/*
        Desktop sidebar. `sticky top-0` + `h-dvh` rather than a plain flex child: as a flex child it
        was as tall as the page, so on any screen taller than the viewport — the dashboard, a long
        gym list — it scrolled up out of sight and the operator lost their navigation halfway down.
        Sticky keeps it in place against the page's own scroll without needing a second scroll
        container. The nav scrolls inside itself if it ever outgrows the viewport.
      */}
      {/*
        Collapsed narrows to an icon rail rather than disappearing: the destinations stay on screen
        and one click away, which is the point of a sidebar. Only the labels go, and hovering an icon
        brings its own back.
      */}
      <aside
        id="app-sidebar"
        className={cn(
          'bg-card sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-300 ease-in-out lg:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        {/*
          `px-4` in both states, never `justify-center`: the rail is 64px and the icon is 20px, so a
          fixed 16px inset already centres it. Switching to centring would have snapped the icon
          sideways while the width was still animating — the jump reads as a glitch, not a
          transition. Same reasoning for the nav links below.
        */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <Dumbbell className="text-primary h-5 w-5 shrink-0" aria-hidden />
          <CollapsibleLabel collapsed={sidebarCollapsed} className="flex items-baseline gap-2">
            <span className="font-semibold">GymOS</span>
            <span className="text-muted-foreground text-xs">Super Admin</span>
          </CollapsibleLabel>
        </div>
        <NavLinks
          collapsed={sidebarCollapsed}
          className={cn(
            'flex-1 space-y-1 p-3',
            // Scrolls only when expanded. Collapsed, the hover labels are absolutely positioned
            // *outside* the rail, and an `overflow-y-auto` ancestor clips on both axes — it would cut
            // every label off at the rail's edge. Seven destinations fit a rail without scrolling.
            sidebarCollapsed ? 'overflow-visible' : 'overflow-y-auto',
          )}
        />
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
        <Topbar
          onOpenDrawer={() => setDrawerOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/**
 * Text that collapses with the rail instead of disappearing from the DOM.
 *
 * Unmounting the label made the collapse look broken: the text vanished on the first frame while the
 * sidebar was still 240px wide and shrinking, so the panel appeared to empty itself and *then*
 * close. Animating `max-width` alongside opacity means the label slides away with the edge that is
 * clipping it.
 *
 * `max-width` rather than `width`, because `width: auto` is not a transitionable value — the
 * animation would snap. The cap only has to exceed the longest label ("Live subscriptions").
 */
function CollapsibleLabel({
  collapsed,
  className,
  children,
}: {
  collapsed: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-in-out',
        collapsed ? 'max-w-0 opacity-0' : 'max-w-[11rem] opacity-100',
        className,
      )}
    >
      {children}
    </span>
  );
}

function NavLinks({
  className,
  onNavigate,
  collapsed = false,
}: {
  className?: string;
  onNavigate?: () => void;
  /** Icon-rail mode: labels are read on hover instead of sitting beside the icon. */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { can } = useSession();

  return (
    <nav className={className} aria-label="Main">
      {NAV_ITEMS.filter((item) => isVisible(item, can)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // `gap-3 px-3` in both states. The gap sits *after* the icon, so a zero-width label
              // does not move it — the icon stays exactly where it was and only the text collapses.
              'group relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />

            <CollapsibleLabel collapsed={collapsed}>{item.label}</CollapsibleLabel>

            {/*
              The hover bubble, only while collapsed. Absolutely positioned, so it escapes the rail
              rather than being clipped by it — which is why the label above collapses its own
              max-width instead of the link carrying `overflow-hidden`.
            */}
            {collapsed && (
              <span
                aria-hidden
                className="bg-popover text-popover-foreground pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {item.label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Topbar({
  onOpenDrawer,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  onOpenDrawer: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
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

      {/* The desktop counterpart of the drawer button. In the bar rather than inside the sidebar so
          it does not move when the rail narrows. */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggleSidebar}
        aria-expanded={!sidebarCollapsed}
        aria-controls="app-sidebar"
        aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
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
