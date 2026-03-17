const domainModules = [
  'Usuarios y autenticacion',
  'Pagos, cuotas y estado de cuenta',
  'Avisos y votaciones',
  'Reportes de mantenimiento',
  'Notificaciones configurables',
  'Gastos y reportes financieros',
];

function App() {
  return (
    <main className="page">
      <section className="hero">
        <h1>Elyx</h1>
        <p>Plataforma de gestion condominal lista para evolucionar por modulos.</p>
      </section>

      <section className="card">
        <h2>Stack base</h2>
        <ul>
          <li>Frontend: React + Vite + TypeScript</li>
          <li>Backend: NestJS + TypeORM</li>
          <li>Base de datos: PostgreSQL</li>
          <li>Infra: Docker Compose</li>
        </ul>
      </section>

      <section className="card">
        <h2>Dominio inicial</h2>
        <ul>
          {domainModules.map((module) => (
            <li key={module}>{module}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default App;
