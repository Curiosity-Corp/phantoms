const stack = [
  ['P', 'PostgreSQL', 'Relational records and durable transactions.'],
  ['H', 'Hono', 'Typed HTTP endpoints served by Bun.'],
  ['A', 'AI', 'Model access behind a replaceable adapter.'],
  ['N', 'Next.js', 'A static App Router web application.'],
  ['T', 'Turborepo', 'A task graph for the Bun workspace.'],
  ['O', 'OpenClaw', 'Optional, isolated agent workflows.'],
  ['M', 'Milvus', 'Optional vector and hybrid retrieval.'],
  ['S', 'SeaweedFS', 'Optional S3-compatible object storage.'],
];

export default function Home() {
  return (
    <main className="shell">
      <p className="eyebrow">Curiosity-Corp · Learning stack</p>
      <h1>Build with a clear stack.</h1>
      <p className="intro">
        PHANTOMS connects a Bun-powered TypeScript application to dependable
        data, a web experience, provider-neutral AI, and the optional services
        that support retrieval and agent workflows. Start with the core; add
        each service when the product needs it.
      </p>

      <section aria-label="PHANTOMS stack" className="grid">
        {stack.map(([letter, name, description]) => (
          <article className="card" key={letter}>
            <span className="letter">{letter}</span>
            <h2>{name}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <p className="footer">
        Read the repository README and <code>AGENTS.md</code> before turning
        this starter into an app.
      </p>
    </main>
  );
}
