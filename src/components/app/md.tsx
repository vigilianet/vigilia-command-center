import { Fragment } from "react";

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : p.startsWith("`") ? (
      <code key={i} className="rounded bg-muted px-1 font-mono text-xs">{p.slice(1, -1)}</code>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

export function Md({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        const h = t.match(/^(#{1,4})\s+(.*)/);
        if (h) return <h3 key={i} className="pt-2 font-semibold">{inline(h[2] ?? "")}</h3>;
        const b = t.match(/^([-*]|\d+[.)])\s+(.*)/);
        if (b) return <div key={i} className="flex gap-2 pl-2"><span className="text-primary">•</span><span>{inline(b[2] ?? "")}</span></div>;
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}