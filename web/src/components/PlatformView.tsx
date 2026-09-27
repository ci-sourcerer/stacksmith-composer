import { BookOpen, GitBranch, ShieldCheck, Layers } from "lucide-react";
import type { Platform } from "../types";

export function PlatformView({ platform }: { platform: Platform }) {
  return (
    <main className="information-view">
      <div className="eyebrow">THE PLATFORM CONTRACT</div>
      <h1>Know what you’re building on.</h1>
      <p className="intro-copy">{platform.description}</p>
      <div className="notice">
        <BookOpen size={17} />
        <span>
          {platform.scope} Source: <code>{platform.source}</code>
        </span>
      </div>
      <div className="info-grid">
        <section className="info-card">
          <Layers size={22} />
          <h2>State & tooling</h2>
          <div className="detail-pair">
            <span>Backend</span>
            <strong>{platform.backend.type ?? platform.backend.kind}</strong>
          </div>
          {Object.entries(platform.tools).map(([name, tool]) => (
            <div className="detail-pair" key={name}>
              <span>{name}</span>
              <code>{tool.version ?? "Platform default"}</code>
            </div>
          ))}
          <p>
            Backend locations, credentials, and executable configuration are not
            displayed.
          </p>
        </section>
        <section className="info-card">
          <ShieldCheck size={22} />
          <h2>Providers & required context</h2>
          {platform.providers.length ? (
            platform.providers.map((provider) => (
              <div className="detail-pair" key={provider.name}>
                <strong>{provider.name}</strong>
                <span>{provider.instances.join(", ") || "default"}</span>
              </div>
            ))
          ) : (
            <p>No providers declared in this configuration.</p>
          )}
          <p>
            Required input sets:{" "}
            {platform.required_input_sets.join(", ") || "None declared"}
          </p>
        </section>
        <section className="info-card">
          <GitBranch size={22} />
          <h2>Managed associations</h2>
          {platform.associations.map((rule) => (
            <div className="rule-doc" key={rule.name}>
              <strong>{rule.name}</strong>
              <p>{rule.description || "No description provided."}</p>
            </div>
          ))}
          {!platform.associations.length && (
            <p>No managed associations declared.</p>
          )}
        </section>
        <section className="info-card">
          <ShieldCheck size={22} />
          <h2>Validation policies</h2>
          {platform.policies.length ? (
            platform.policies.map((policy) => (
              <div className="rule-doc" key={`${policy.kind}:${policy.name}`}>
                <strong>{policy.name}</strong>
                <small>{policy.kind.replaceAll("_", " ")}</small>
                <p>{policy.description || "No description provided."}</p>
              </div>
            ))
          ) : (
            <p>
              No named validation policies declared. Full validation and
              planning still run in CI.
            </p>
          )}
        </section>
      </div>
      {platform.has_default_mapping && (
        <div className="notice">
          This platform has a default module mapping. The catalog currently
          lists explicitly mapped component types only.
        </div>
      )}
    </main>
  );
}
