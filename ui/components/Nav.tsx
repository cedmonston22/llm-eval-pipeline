import Link from "next/link";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/search", label: "Search" },
  { href: "/annotate", label: "Annotate" },
];

/** Top navigation bar rendered in the root layout on every page. */
export default function Nav() {
  return (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <span className="font-mono text-sm font-semibold tracking-tight">
          eval-pipeline
        </span>
        <ul className="flex items-center gap-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
