const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#live-demo", label: "Live demo" },
  { href: "#consent", label: "Consent" },
  { href: "#patient", label: "Patient" },
  { href: "#doctor", label: "Doctor" },
  { href: "#pricing", label: "Pricing" },
];

export default function SectionNav() {
  return (
    <nav
      aria-label="Page sections"
      className="sticky top-0 z-10 -mx-6 mb-6 overflow-x-auto border-b border-line bg-ink/90 px-6 py-2.5 backdrop-blur"
    >
      <ul className="flex w-max min-w-full items-center gap-5 font-mono text-xs uppercase tracking-wide text-text-muted">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="whitespace-nowrap transition hover:text-trust">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
