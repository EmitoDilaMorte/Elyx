type SuperuserUserForm = {
  nombre: string;
  apellidoPaterno: string;
  correo: string;
  claveUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
};

type SuperuserUnidadForm = {
  claveUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
};

type SuperCondominioItem = {
  idCondominio: number;
  nombre: string;
  direccion: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
  fechaAlta: string;
  totalAdmins: number;
  totalCondominos: number;
  totalUsuarios: number;
};

type SuperuserPageProps = {
  sessionName: string;
  loadingLabel: string | null;
  feedback: string | null;
  nombreCondominio: string;
  direccionCondominio: string;
  montoCuotaInicial: string;
  diaLimitePago: string;
  recargoFijoPorDia: string;
  periodoAplicacionInicial: string;
  fechaInicioCobro: string;
  admins: SuperuserUserForm[];
  condominos: SuperuserUserForm[];
  unidades: SuperuserUnidadForm[];
  createdSummary: {
    idCondominio: number;
    adminsCreados: Array<{ correo: string; passwordTemporal: string | null; reutilizado: boolean }>;
    condominosCreados: Array<{ correo: string; passwordTemporal: string | null; reutilizado: boolean }>;
    unidadesCreadas: number;
    ocupacionesCreadas: number;
    cuotasInicialesCreadas: number;
    cuotaInicial: {
      montoCuotaInicial: number;
      diaLimitePago: number;
      recargoFijoPorDia: number;
      periodoAplicacionInicial: string;
      fechaInicioCobro: string;
    };
    advertenciaCuotas?: string;
  } | null;
  superSection: 'alta' | 'condominios';
  condominios: SuperCondominioItem[];
  onSectionChange: (section: 'alta' | 'condominios') => void;
  onRefreshCondominios: () => void;
  onToggleCondominioEstado: (idCondominio: number, nextEstado: 'ACTIVO' | 'INACTIVO') => void;
  onNombreCondominioChange: (value: string) => void;
  onDireccionCondominioChange: (value: string) => void;
  onMontoCuotaInicialChange: (value: string) => void;
  onDiaLimitePagoChange: (value: string) => void;
  onRecargoFijoPorDiaChange: (value: string) => void;
  onPeriodoAplicacionInicialChange: (value: string) => void;
  onFechaInicioCobroChange: (value: string) => void;
  onUserFieldChange: (
    group: 'admins' | 'condominos',
    index: number,
    field: keyof SuperuserUserForm,
    value: string,
  ) => void;
  onAddUser: (group: 'admins' | 'condominos') => void;
  onRemoveUser: (group: 'admins' | 'condominos', index: number) => void;
  onUnidadFieldChange: (index: number, field: keyof SuperuserUnidadForm, value: string) => void;
  onAddUnidad: () => void;
  onRemoveUnidad: (index: number) => void;
  onSubmit: () => void;
  onLogout: () => void;
};

export function SuperuserPage({
  sessionName,
  loadingLabel,
  feedback,
  nombreCondominio,
  direccionCondominio,
  montoCuotaInicial,
  diaLimitePago,
  recargoFijoPorDia,
  periodoAplicacionInicial,
  fechaInicioCobro,
  admins,
  condominos,
  unidades,
  createdSummary,
  superSection,
  condominios,
  onSectionChange,
  onRefreshCondominios,
  onToggleCondominioEstado,
  onNombreCondominioChange,
  onDireccionCondominioChange,
  onMontoCuotaInicialChange,
  onDiaLimitePagoChange,
  onRecargoFijoPorDiaChange,
  onPeriodoAplicacionInicialChange,
  onFechaInicioCobroChange,
  onUserFieldChange,
  onAddUser,
  onRemoveUser,
  onUnidadFieldChange,
  onAddUnidad,
  onRemoveUnidad,
  onSubmit,
  onLogout,
}: SuperuserPageProps) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="app-bg">
      <div className="super-shell">
        <section className="panel animate-in super-nav-panel">
          <div>
            <p className="brand-kicker">Panel de superusuario</p>
            <h2>Control central Elyx</h2>
            <p className="helper-text">Sesion activa: {sessionName}</p>
          </div>
          <div className="super-tabs">
            <button
              className={superSection === 'alta' ? 'primary-btn' : 'soft-btn'}
              onClick={() => onSectionChange('alta')}
            >
              Alta de condominios
            </button>
            <button
              className={superSection === 'condominios' ? 'primary-btn' : 'soft-btn'}
              onClick={() => onSectionChange('condominios')}
            >
              Gestion de condominios
            </button>
          </div>
          <div className="btn-row" style={{ marginTop: '0.8rem' }}>
            <button className="soft-btn" onClick={onLogout}>
              Cerrar sesion
            </button>
          </div>
        </section>

        {superSection === 'alta' && (
          <section className="panel animate-in">
            <div className="super-header">
              <div>
                <h3>Alta de condominio y usuarios</h3>
                <p className="helper-text">Si el correo ya existe, se reutiliza y solo se agrega al condominio.</p>
              </div>
            </div>

            <div className="grid-cards super-grid">
              <div>
                <label className="field-label">Nombre del condominio</label>
                <input value={nombreCondominio} onChange={(event) => onNombreCondominioChange(event.target.value)} />
              </div>
              <div>
                <label className="field-label">Direccion (opcional)</label>
                <input value={direccionCondominio} onChange={(event) => onDireccionCondominioChange(event.target.value)} />
              </div>
            </div>

            <section className="super-block">
              <div className="super-block-header">
                <h3>Configuracion de cuota inicial</h3>
              </div>
              <div className="grid-cards super-grid">
                <div>
                  <label className="field-label">Monto cuota inicial (MXN)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={montoCuotaInicial}
                    onChange={(event) => onMontoCuotaInicialChange(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Dia limite de pago (1-28)</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    step="1"
                    value={diaLimitePago}
                    onChange={(event) => onDiaLimitePagoChange(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Recargo fijo por dia (MXN)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recargoFijoPorDia}
                    onChange={(event) => onRecargoFijoPorDiaChange(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Periodo de aplicacion inicial (YYYY-MM)</label>
                  <input
                    placeholder="2026-05"
                    value={periodoAplicacionInicial}
                    onChange={(event) => onPeriodoAplicacionInicialChange(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Fecha de inicio de cobro</label>
                  <input
                    type="date"
                    min={todayIso}
                    value={fechaInicioCobro}
                    onChange={(event) => onFechaInicioCobroChange(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="super-block">
              <div className="super-block-header">
                <h3>Administradores</h3>
                <button className="soft-btn" onClick={() => onAddUser('admins')}>
                  Agregar otro admin
                </button>
              </div>
              {admins.map((admin, index) => (
                <div key={`admin-${index}`} className="super-user-row">
                  <input
                    placeholder="Nombre"
                    value={admin.nombre}
                    onChange={(event) => onUserFieldChange('admins', index, 'nombre', event.target.value)}
                  />
                  <input
                    placeholder="Apellido"
                    value={admin.apellidoPaterno}
                    onChange={(event) => onUserFieldChange('admins', index, 'apellidoPaterno', event.target.value)}
                  />
                  <input
                    placeholder="Correo"
                    value={admin.correo}
                    onChange={(event) => onUserFieldChange('admins', index, 'correo', event.target.value)}
                  />
                  <button className="soft-btn" onClick={() => onRemoveUser('admins', index)} disabled={admins.length === 1}>
                    Quitar
                  </button>
                </div>
              ))}
            </section>

            <section className="super-block">
              <div className="super-block-header">
                <h3>Condominos</h3>
                <button className="soft-btn" onClick={() => onAddUser('condominos')}>
                  Agregar otro usuario
                </button>
              </div>
              <p className="helper-text">Cada condomino debe tener su unidad asignada.</p>
              {condominos.map((condomino, index) => (
                <div key={`condomino-${index}`} className="super-user-row super-user-row-condomino">
                  <input
                    placeholder="Nombre"
                    value={condomino.nombre}
                    onChange={(event) => onUserFieldChange('condominos', index, 'nombre', event.target.value)}
                  />
                  <input
                    placeholder="Apellido"
                    value={condomino.apellidoPaterno}
                    onChange={(event) => onUserFieldChange('condominos', index, 'apellidoPaterno', event.target.value)}
                  />
                  <input
                    placeholder="Correo"
                    value={condomino.correo}
                    onChange={(event) => onUserFieldChange('condominos', index, 'correo', event.target.value)}
                  />
                  <input
                    placeholder="Clave unidad (ej. A-101)"
                    value={condomino.claveUnidad}
                    onChange={(event) => onUserFieldChange('condominos', index, 'claveUnidad', event.target.value)}
                  />
                  <select
                    className="condominio-switcher-select"
                    value={condomino.tipoUnidad}
                    onChange={(event) =>
                      onUserFieldChange('condominos', index, 'tipoUnidad', event.target.value as SuperuserUserForm['tipoUnidad'])
                    }
                  >
                    <option value="CASA">CASA</option>
                    <option value="DEPARTAMENTO">DEPARTAMENTO</option>
                    <option value="LOCAL">LOCAL</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                  <button
                    className="soft-btn"
                    onClick={() => onRemoveUser('condominos', index)}
                    disabled={condominos.length === 1}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </section>

            <section className="super-block">
              <div className="super-block-header">
                <h3>Unidades sin ocupante</h3>
                <button className="soft-btn" onClick={onAddUnidad}>
                  Agregar unidad
                </button>
              </div>
              {unidades.map((unidad, index) => (
                <div key={`unidad-${index}`} className="super-user-row super-user-row-unidad">
                  <input
                    placeholder="Clave (ej. A-101)"
                    value={unidad.claveUnidad}
                    onChange={(event) => onUnidadFieldChange(index, 'claveUnidad', event.target.value)}
                  />
                  <select
                    className="condominio-switcher-select"
                    value={unidad.tipoUnidad}
                    onChange={(event) =>
                      onUnidadFieldChange(index, 'tipoUnidad', event.target.value as SuperuserUnidadForm['tipoUnidad'])
                    }
                  >
                    <option value="CASA">CASA</option>
                    <option value="DEPARTAMENTO">DEPARTAMENTO</option>
                    <option value="LOCAL">LOCAL</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                  <button className="soft-btn" onClick={() => onRemoveUnidad(index)}>
                    Quitar
                  </button>
                </div>
              ))}
            </section>

            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <button className="primary-btn" onClick={onSubmit}>
                Crear condominio y usuarios
              </button>
            </div>

            {loadingLabel && <p className="helper-text">{loadingLabel}</p>}
            {feedback && <p className="login-error">{feedback}</p>}
          </section>
        )}

        {superSection === 'condominios' && (
          <section className="panel animate-in">
            <div className="super-block-header">
              <div>
                <h3>Gestion de condominios</h3>
                <p className="helper-text">Puedes activar o inactivar condominios completos.</p>
              </div>
              <button className="soft-btn" onClick={onRefreshCondominios}>
                Actualizar listado
              </button>
            </div>

            <div className="super-condo-list">
              {condominios.map((condominio) => (
                <article key={condominio.idCondominio} className="super-condo-card">
                  <div>
                    <h4>
                      #{condominio.idCondominio} - {condominio.nombre}
                    </h4>
                    <p className="helper-text">{condominio.direccion || 'Sin direccion registrada'}</p>
                    <p className="helper-text">
                      Admins: {condominio.totalAdmins} | Condominos: {condominio.totalCondominos} | Usuarios:{' '}
                      {condominio.totalUsuarios}
                    </p>
                  </div>
                  <div className="btn-row">
                    <span className={condominio.estado === 'ACTIVO' ? 'status-chip status-ok' : 'status-chip status-warning'}>
                      {condominio.estado}
                    </span>
                    <button
                      className="soft-btn"
                      onClick={() =>
                        onToggleCondominioEstado(
                          condominio.idCondominio,
                          condominio.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO',
                        )
                      }
                    >
                      {condominio.estado === 'ACTIVO' ? 'Poner inactivo' : 'Reactivar'}
                    </button>
                  </div>
                </article>
              ))}
              {condominios.length === 0 && <p className="helper-text">No hay condominios para mostrar.</p>}
            </div>

            {loadingLabel && <p className="helper-text">{loadingLabel}</p>}
            {feedback && <p className="login-error">{feedback}</p>}
          </section>
        )}

        {createdSummary && (
          <section className="panel animate-in">
            <h3>Resultado de alta</h3>
            <p className="helper-text">Condominio creado con ID {createdSummary.idCondominio}.</p>
            <p className="helper-text">
              Cuota inicial: ${createdSummary.cuotaInicial.montoCuotaInicial.toFixed(2)} | Dia limite: {createdSummary.cuotaInicial.diaLimitePago} | Recargo por dia: ${createdSummary.cuotaInicial.recargoFijoPorDia.toFixed(2)} | Periodo: {createdSummary.cuotaInicial.periodoAplicacionInicial}
            </p>
            <p className="helper-text">
              Unidades creadas: {createdSummary.unidadesCreadas} | Asignaciones creadas: {createdSummary.ocupacionesCreadas}
            </p>
            <p className="helper-text">Cuotas iniciales creadas: {createdSummary.cuotasInicialesCreadas}</p>
            {createdSummary.advertenciaCuotas ? <p className="login-error">{createdSummary.advertenciaCuotas}</p> : null}
            <h4>Credenciales temporales de administradores</h4>
            <ul className="clean-list">
              {createdSummary.adminsCreados.map((item) => (
                <li key={`adm-result-${item.correo}`}>
                  <strong>{item.correo}</strong> - {item.passwordTemporal ?? 'Usuario existente reutilizado'}
                </li>
              ))}
            </ul>
            <h4>Credenciales temporales de condominos</h4>
            <ul className="clean-list">
              {createdSummary.condominosCreados.map((item) => (
                <li key={`con-result-${item.correo}`}>
                  <strong>{item.correo}</strong> - {item.passwordTemporal ?? 'Usuario existente reutilizado'}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
