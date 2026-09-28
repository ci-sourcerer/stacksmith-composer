import {
  BookOpen,
  Boxes,
  Code2,
  ExternalLink,
  GitBranch,
  Layers,
  ShieldCheck,
} from "lucide-react";
import type { Platform, SourceDetails } from "../types";

function SourceAttribution({ source }: { source: SourceDetails }) {
  const content = (
    <>
      <Code2 size={13} />
      <span>{source.label}</span>
      {source.url && <ExternalLink size={12} />}
    </>
  );

  return (
    <div className="source-attribution">
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer">
          {content}
        </a>
      ) : (
        <span>{content}</span>
      )}
      {source.detail && <code title={source.detail}>{source.detail}</code>}
    </div>
  );
}

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

      <div className="info-grid platform-overview">
        <section className="info-card">
          <Layers size={22} />
          <h2>State & tooling</h2>
          <div className="detail-block">
            <div className="detail-pair">
              <span>Backend</span>
              <strong>{platform.backend.type ?? platform.backend.kind}</strong>
            </div>
            <SourceAttribution source={platform.backend.source} />
          </div>
          {Object.entries(platform.tools).map(([name, tool]) => (
            <div className="detail-block" key={name}>
              <div className="detail-pair">
                <span>{name}</span>
                <code>{tool.version ?? "Platform default"}</code>
              </div>
              <SourceAttribution source={tool.source} />
            </div>
          ))}
          <p>
            Backend locations, credentials, and executable configuration values
            are hidden.
          </p>
        </section>

        <section className="info-card">
          <ShieldCheck size={22} />
          <h2>Providers & required context</h2>
          {platform.providers.length ? (
            platform.providers.map((provider) => (
              <div className="provider-doc" key={provider.name}>
                <div className="detail-pair">
                  <strong>{provider.name}</strong>
                  <code>{provider.version ?? "Platform default"}</code>
                </div>
                <code className="provider-address">{provider.address}</code>
                <SourceAttribution source={provider.source} />
                <div className="provider-instances">
                  {provider.instances.map((instance) => (
                    <div key={instance.name}>
                      <strong>{instance.name}</strong>
                      <p>
                        {instance.description || "Default provider instance."}
                      </p>
                      <SourceAttribution source={instance.source} />
                    </div>
                  ))}
                </div>
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
      </div>

      <section className="platform-section">
        <div className="section-heading">
          <Boxes size={22} />
          <div>
            <h2>Managed component types</h2>
            <p>
              Each component resolves to an administrator-approved OpenTofu
              module and public interface.
            </p>
          </div>
        </div>
        <div className="platform-card-grid">
          {platform.components.map((component) => (
            <article className="platform-component-card" key={component.name}>
              <div className="component-summary">
                <div>
                  <h3>{component.description || component.name}</h3>
                  <code>{component.name}</code>
                </div>
                <div className="tag-list">
                  {component.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <SourceAttribution source={component.source} />
              <div className="interface-summary">
                <div>
                  <strong>Inputs</strong>
                  <span>
                    {component.inputs.map(({ name }) => name).join(", ")}
                  </span>
                </div>
                <div>
                  <strong>Outputs</strong>
                  <span>
                    {component.outputs.map(({ name }) => name).join(", ")}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="info-grid platform-rules">
        <section className="info-card">
          <GitBranch size={22} />
          <h2>Managed associations</h2>
          {platform.associations.map((rule) => (
            <div className="rule-doc" key={rule.name}>
              <strong>{rule.name}</strong>
              <p>{rule.description || "No description provided."}</p>
              <SourceAttribution source={rule.source} />
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
                <div className="rule-heading">
                  <strong>{policy.name}</strong>
                  <small>{policy.kind.replaceAll("_", " ")}</small>
                </div>
                <p>{policy.description || "No description provided."}</p>
                <SourceAttribution source={policy.source} />
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
