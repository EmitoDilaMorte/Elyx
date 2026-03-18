import { useEffect, useMemo, useState } from 'react';
import { navAdministrador, navCondomino } from './constants/navigation';
import { statusLabel } from './constants/status';
import { ActiveCondominioProvider, useActiveCondominio } from './contexts/ActiveCondominioContext';
import { formatShortDate, loadAppData, persistAppData, todayIso } from './lib/appData';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import type {
  AppData,
  Aviso,
  Condominio,
  Cuota,
  CuotaStatus,
  DemoUser,
  Gasto,
  MantenimientoReporte,
  MantenimientoStatus,
  Pago,
  PagoStatus,
  ReporteFinanciero,
  RoleKey,
  UserMembership,
  ViewKey,
  VoteChoice,
  VotacionActiva,
} from './types/app';

const ACTIVE_CONDOMINIO_STORAGE_PREFIX = 'elyx-active-condominio';

function getActiveCondominioStorageKey(correo: string) {
  return `${ACTIVE_CONDOMINIO_STORAGE_PREFIX}-${correo}`;
}

function getPersistedActiveCondominio(correo: string): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(getActiveCondominioStorageKey(correo));
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function persistActiveCondominio(correo: string, condominioId: number) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(getActiveCondominioStorageKey(correo), String(condominioId));
}

function AppContent() {
  const { activeCondominioId, setActiveCondominioId } = useActiveCondominio();

  const [appData, setAppData] = useState<AppData>(() => loadAppData());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<RoleKey>('condomino');
  const [sessionUser, setSessionUser] = useState<DemoUser | null>(null);
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('inicio');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [falla, setFalla] = useState('');
  const [avisoTitulo, setAvisoTitulo] = useState('');
  const [avisoMensaje, setAvisoMensaje] = useState('');
  const [gastoConcepto, setGastoConcepto] = useState('');
  const [gastoCategoria, setGastoCategoria] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [votacionPregunta, setVotacionPregunta] = useState('');

  const navItems = role === 'condomino' ? navCondomino : navAdministrador;

  const memberships = useMemo(() => {
    if (!sessionUser) {
      return [] as UserMembership[];
    }
    return sessionUser.membresias.filter((item: UserMembership) => item.estado === 'ACTIVO');
  }, [sessionUser]);

  const condominiosDisponibles = useMemo(() => {
    const allowedIds = new Set(memberships.map((item: UserMembership) => item.idCondominio));
    return appData.condominios.filter((item: Condominio) => allowedIds.has(item.idCondominio));
  }, [appData.condominios, memberships]);

  const effectiveActiveCondominioId = useMemo(() => {
    if (condominiosDisponibles.length === 0) {
      return activeCondominioId;
    }

    if (
      activeCondominioId &&
      condominiosDisponibles.some((item: Condominio) => item.idCondominio === activeCondominioId)
    ) {
      return activeCondominioId;
    }

    return condominiosDisponibles[0].idCondominio;
  }, [activeCondominioId, condominiosDisponibles]);

  useEffect(() => {
    if (!effectiveActiveCondominioId) {
      return;
    }
    if (effectiveActiveCondominioId !== activeCondominioId) {
      setActiveCondominioId(effectiveActiveCondominioId);
    }
  }, [activeCondominioId, effectiveActiveCondominioId, setActiveCondominioId]);

  const activeMembership = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return undefined;
    }

    return memberships.find((item: UserMembership) => item.idCondominio === effectiveActiveCondominioId);
  }, [effectiveActiveCondominioId, memberships]);

  const cuotasScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as Cuota[];
    }

    return appData.cuotas.filter((item: Cuota) => item.idCondominio === effectiveActiveCondominioId);
  }, [appData.cuotas, effectiveActiveCondominioId]);

  const pagosScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as Pago[];
    }

    return appData.pagos.filter((item: Pago) => item.idCondominio === effectiveActiveCondominioId);
  }, [appData.pagos, effectiveActiveCondominioId]);

  const avisosScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as Aviso[];
    }

    return appData.avisos
      .filter((item: Aviso) => item.idCondominio === effectiveActiveCondominioId)
      .slice()
      .reverse();
  }, [appData.avisos, effectiveActiveCondominioId]);

  const votacionesScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as VotacionActiva[];
    }

    return appData.votacionesActivas.filter((item: VotacionActiva) => item.idCondominio === effectiveActiveCondominioId);
  }, [appData.votacionesActivas, effectiveActiveCondominioId]);

  const mantenimientosScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as MantenimientoReporte[];
    }

    return appData.mantenimientos.filter((item: MantenimientoReporte) => item.idCondominio === effectiveActiveCondominioId);
  }, [appData.mantenimientos, effectiveActiveCondominioId]);

  const gastosScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as Gasto[];
    }

    return appData.gastos
      .filter((item: Gasto) => item.idCondominio === effectiveActiveCondominioId)
      .slice()
      .reverse();
  }, [appData.gastos, effectiveActiveCondominioId]);

  const reportesScoped = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return [] as ReporteFinanciero[];
    }

    return appData.reportes.filter((item: ReporteFinanciero) => item.idCondominio === effectiveActiveCondominioId);
  }, [appData.reportes, effectiveActiveCondominioId]);

  const cuotasPendientes = useMemo(
    () => cuotasScoped.filter((cuota: Cuota) => cuota.status !== 'PAGADA'),
    [cuotasScoped],
  );

  const pagosPendientesAdmin = useMemo(
    () => pagosScoped.filter((pago: Pago) => pago.status === 'PENDIENTE'),
    [pagosScoped],
  );

  const cuotasPagadas = useMemo(
    () => cuotasScoped.filter((cuota: Cuota) => cuota.status === 'PAGADA').length,
    [cuotasScoped],
  );

  const cobranzaProgreso = useMemo(() => {
    if (cuotasScoped.length === 0) {
      return 0;
    }
    return Math.round((cuotasPagadas / cuotasScoped.length) * 100);
  }, [cuotasPagadas, cuotasScoped.length]);

  const votacionesPendientesUsuario = useMemo(() => {
    if (!sessionUser) {
      return 0;
    }

    return votacionesScoped.filter((item: VotacionActiva) => !item.votosPorUsuario[sessionUser.correo]).length;
  }, [sessionUser, votacionesScoped]);

  const gastosRecientes = useMemo(() => gastosScoped.slice(0, 6), [gastosScoped]);

  const mantenimientosAbiertos = useMemo(
    () => mantenimientosScoped.filter((item: MantenimientoReporte) => item.estado !== 'RESUELTO').length,
    [mantenimientosScoped],
  );

  const saldoActual = useMemo(() => {
    return cuotasPendientes.reduce((acc: number, cuota: Cuota) => acc + cuota.monto + cuota.recargo, 0);
  }, [cuotasPendientes]);

  const balanceMensual = useMemo(() => {
    const totalIngresos = reportesScoped.reduce((sum: number, reporte: ReporteFinanciero) => sum + reporte.ingresos, 0);
    const totalGastos = gastosScoped.reduce((sum: number, gasto: Gasto) => sum + gasto.monto, 0);
    return totalIngresos - totalGastos;
  }, [gastosScoped, reportesScoped]);

  const panelReminders = useMemo(() => {
    const reminders: string[] = [];

    if (role === 'condomino') {
      if (cuotasPendientes.length > 0) {
        reminders.push(`Tienes ${cuotasPendientes.length} cuota(s) pendiente(s) por pagar.`);
      }
      if (votacionesPendientesUsuario > 0) {
        reminders.push(`Hay ${votacionesPendientesUsuario} votacion(es) pendiente(s) por responder.`);
      }
      if (mantenimientosAbiertos > 0) {
        reminders.push(`Hay ${mantenimientosAbiertos} reporte(s) de mantenimiento abierto(s) en seguimiento.`);
      }
    } else {
      if (pagosPendientesAdmin.length > 0) {
        reminders.push(`Hay ${pagosPendientesAdmin.length} pago(s) pendiente(s) por validar.`);
      }
      if (votacionesScoped.length === 0) {
        reminders.push('No hay votaciones activas en este condominio.');
      }
      if (mantenimientosAbiertos > 0) {
        reminders.push(`Hay ${mantenimientosAbiertos} reporte(s) de mantenimiento pendiente(s) de cierre.`);
      }
    }

    if (reminders.length === 0) {
      reminders.push('Todo al corriente por ahora.');
    }

    return reminders.slice(0, 3);
  }, [
    cuotasPendientes.length,
    mantenimientosAbiertos,
    pagosPendientesAdmin.length,
    role,
    votacionesPendientesUsuario,
    votacionesScoped.length,
  ]);

  const scopedData = useMemo(
    () => ({
      ...appData,
      cuotas: cuotasScoped,
      pagos: pagosScoped,
      avisos: avisosScoped,
      votacionesActivas: votacionesScoped,
      mantenimientos: mantenimientosScoped,
      gastos: gastosScoped,
      reportes: reportesScoped,
    }),
    [
      appData,
      avisosScoped,
      cuotasScoped,
      gastosScoped,
      mantenimientosScoped,
      pagosScoped,
      reportesScoped,
      votacionesScoped,
    ],
  );

  const runAction = (loading: string, success: string) => {
    setLoadingLabel(loading);
    window.setTimeout(() => {
      setLoadingLabel(null);
      setFeedback(success);
      window.setTimeout(() => setFeedback(null), 2200);
    }, 900);
  };

  const patchAppData = (updater: (prev: AppData) => AppData) => {
    setAppData((prev: AppData) => {
      const next = updater(prev);
      persistAppData(next);
      return next;
    });
  };

  const closeMobileMenu = () => setMenuOpen(false);

  const handleCondominioChange = (condominioId: number) => {
    if (!sessionUser) {
      return;
    }

    setActiveCondominioId(condominioId);
    persistActiveCondominio(sessionUser.correo, condominioId);

    const condominioName = appData.condominios.find((item: Condominio) => item.idCondominio === condominioId)?.nombre;
    runAction('Cambiando condominio...', `Mostrando ${condominioName ?? 'condominio seleccionado'}`);
  };

  const handleLogin = () => {
    const correoNormalizado = correo.trim().toLowerCase();
    const matchedUser = appData.users.find(
      (user: DemoUser) => user.correo === correoNormalizado && user.password === password,
    );

    if (!matchedUser) {
      setLoginError('Credenciales no validas. Revisa correo y contrasena.');
      return;
    }

    const membresiasActivas = matchedUser.membresias.filter((item: UserMembership) => item.estado === 'ACTIVO');
    if (membresiasActivas.length === 0) {
      setLoginError('Tu usuario no tiene condominios activos asignados.');
      return;
    }

    setLoginError(null);
    runAction('Iniciando sesion...', 'Bienvenido a Elyx');

    const persistedCondominio = getPersistedActiveCondominio(matchedUser.correo);
    const condominioValido = persistedCondominio
      ? membresiasActivas.find((item: UserMembership) => item.idCondominio === persistedCondominio)
      : undefined;

    const selectedCondominioId = condominioValido?.idCondominio ?? membresiasActivas[0].idCondominio;

    window.setTimeout(() => {
      setRole(matchedUser.role);
      setSessionUser(matchedUser);
      setActiveCondominioId(selectedCondominioId);
      persistActiveCondominio(matchedUser.correo, selectedCondominioId);
      setActiveView('inicio');
      setIsAuthenticated(true);
      setMenuOpen(false);
    }, 380);
  };

  const cerrarSesion = () => {
    setIsAuthenticated(false);
    setSessionUser(null);
    setCorreo('');
    setPassword('');
    setLoginError(null);
  };

  const registrarPagoCondomino = (cuotaId: number) => {
    if (!sessionUser || !effectiveActiveCondominioId) {
      return;
    }

    patchAppData((prev) => {
      const cuota = prev.cuotas.find(
        (item: Cuota) => item.id === cuotaId && item.idCondominio === effectiveActiveCondominioId,
      );
      if (!cuota || cuota.status !== 'PENDIENTE') {
        return prev;
      }

      const updatedCuotas = prev.cuotas.map((item: Cuota) =>
        item.id === cuotaId ? { ...item, status: 'EN_VALIDACION' as CuotaStatus } : item,
      );

      const membershipPaga = sessionUser.membresias.find(
        (item: UserMembership) => item.idCondominio === effectiveActiveCondominioId,
      );

      const nuevoPago: Pago = {
        id: prev.nextIds.pago,
        idCondominio: effectiveActiveCondominioId,
        cuotaId,
        condominio: sessionUser.nombre,
        monto: cuota.monto,
        fecha: todayIso(),
        status: 'PENDIENTE',
        idUsuarioCondominioPaga: membershipPaga?.idUsuarioCondominio,
      };

      return {
        ...prev,
        cuotas: updatedCuotas,
        pagos: [...prev.pagos, nuevoPago],
        nextIds: {
          ...prev.nextIds,
          pago: prev.nextIds.pago + 1,
        },
      };
    });

    runAction('Registrando pago...', 'Pago enviado para validacion');
  };

  const aprobarPago = (idPago: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    patchAppData((prev) => {
      const pago = prev.pagos.find(
        (item: Pago) => item.id === idPago && item.idCondominio === effectiveActiveCondominioId,
      );
      if (!pago || pago.status !== 'PENDIENTE') {
        return prev;
      }

      return {
        ...prev,
        pagos: prev.pagos.map((item: Pago) =>
          item.id === idPago
            ? {
                ...item,
                status: 'APROBADO' as PagoStatus,
                idUsuarioCondominioAdmin: activeMembership?.idUsuarioCondominio,
              }
            : item,
        ),
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === pago.cuotaId ? { ...item, status: 'PAGADA' as CuotaStatus, recargo: 0 } : item,
        ),
      };
    });

    runAction('Validando pago...', 'Pago validado con exito');
  };

  const rechazarPago = (idPago: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    patchAppData((prev) => {
      const pago = prev.pagos.find(
        (item: Pago) => item.id === idPago && item.idCondominio === effectiveActiveCondominioId,
      );
      if (!pago || pago.status !== 'PENDIENTE') {
        return prev;
      }

      return {
        ...prev,
        pagos: prev.pagos.map((item: Pago) =>
          item.id === idPago
            ? {
                ...item,
                status: 'RECHAZADO' as PagoStatus,
                idUsuarioCondominioAdmin: activeMembership?.idUsuarioCondominio,
              }
            : item,
        ),
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === pago.cuotaId ? { ...item, status: 'PENDIENTE' as CuotaStatus } : item,
        ),
      };
    });

    runAction('Actualizando estado...', 'Pago rechazado y notificado');
  };

  const publicarAviso = () => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const titulo = avisoTitulo.trim();
    const mensaje = avisoMensaje.trim();

    if (!titulo || !mensaje) {
      setFeedback('Completa titulo y descripcion del aviso');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    patchAppData((prev) => {
      const nuevoAviso: Aviso = {
        id: prev.nextIds.aviso,
        idCondominio: effectiveActiveCondominioId,
        titulo,
        mensaje,
        fecha: formatShortDate(todayIso()),
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
      };

      return {
        ...prev,
        avisos: [...prev.avisos, nuevoAviso],
        nextIds: {
          ...prev.nextIds,
          aviso: prev.nextIds.aviso + 1,
        },
      };
    });

    setAvisoTitulo('');
    setAvisoMensaje('');
    runAction('Publicando aviso...', 'Aviso publicado con exito');
  };

  const votar = (votacionId: number, choice: VoteChoice) => {
    if (!sessionUser || !effectiveActiveCondominioId) {
      return;
    }

    patchAppData((prev) => {
      const votacion = prev.votacionesActivas.find(
        (item: VotacionActiva) => item.idCondominio === effectiveActiveCondominioId && item.id === votacionId,
      );

      if (!votacion || votacion.votosPorUsuario[sessionUser.correo]) {
        return prev;
      }

      return {
        ...prev,
        votacionesActivas: prev.votacionesActivas.map((item: VotacionActiva) =>
          item.id === votacion.id
            ? {
                ...item,
                aFavor: item.aFavor + (choice === 'favor' ? 1 : 0),
                enContra: item.enContra + (choice === 'contra' ? 1 : 0),
                votosPorUsuario: {
                  ...item.votosPorUsuario,
                  [sessionUser.correo]: choice,
                },
              }
            : item,
        ),
      };
    });

    runAction('Registrando voto...', 'Voto registrado con exito');
  };

  const crearVotacion = () => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const pregunta = votacionPregunta.trim();
    if (pregunta.length < 10) {
      setFeedback('La pregunta de votacion debe tener al menos 10 caracteres');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    patchAppData((prev) => {
      const nuevaVotacion: VotacionActiva = {
        id: prev.nextIds.votacion,
        idCondominio: effectiveActiveCondominioId,
        pregunta,
        aFavor: 0,
        enContra: 0,
        votosPorUsuario: {},
      };

      return {
        ...prev,
        votacionesActivas: [nuevaVotacion, ...prev.votacionesActivas],
        nextIds: {
          ...prev.nextIds,
          votacion: prev.nextIds.votacion + 1,
        },
      };
    });

    setVotacionPregunta('');
    runAction('Publicando votacion...', 'Votacion creada con exito');
  };

  const cerrarVotacion = (votacionId: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    patchAppData((prev) => ({
      ...prev,
      votacionesActivas: prev.votacionesActivas.filter(
        (item: VotacionActiva) => !(item.idCondominio === effectiveActiveCondominioId && item.id === votacionId),
      ),
    }));

    runAction('Cerrando votacion...', 'Votacion cerrada y archivada');
  };

  const enviarReporteMantenimiento = () => {
    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const descripcion = falla.trim();
    if (!descripcion) {
      return;
    }

    patchAppData((prev) => {
      const nuevoReporte: MantenimientoReporte = {
        id: prev.nextIds.mantenimiento,
        idCondominio: effectiveActiveCondominioId,
        unidad: sessionUser.nombre,
        descripcion,
        fecha: formatShortDate(todayIso()),
        estado: 'NUEVO',
        idUsuarioCondominioReporta: activeMembership.idUsuarioCondominio,
      };

      return {
        ...prev,
        mantenimientos: [nuevoReporte, ...prev.mantenimientos],
        nextIds: {
          ...prev.nextIds,
          mantenimiento: prev.nextIds.mantenimiento + 1,
        },
      };
    });

    setFalla('');
    runAction('Enviando reporte...', 'Reporte de mantenimiento enviado');
  };

  const actualizarEstadoMantenimiento = (id: number, estado: MantenimientoStatus) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    patchAppData((prev) => ({
      ...prev,
      mantenimientos: prev.mantenimientos.map((item: MantenimientoReporte) =>
        item.id === id && item.idCondominio === effectiveActiveCondominioId
          ? { ...item, estado, idUsuarioCondominioAdmin: activeMembership?.idUsuarioCondominio }
          : item,
      ),
    }));
    runAction('Actualizando estado...', `Estado actualizado a ${statusLabel[estado]}`);
  };

  const registrarGasto = () => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    const concepto = gastoConcepto.trim();
    const categoria = gastoCategoria.trim();
    const monto = Number(gastoMonto);

    if (!concepto || !categoria || Number.isNaN(monto) || monto <= 0) {
      setFeedback('Completa correctamente concepto, categoria y monto');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    patchAppData((prev) => {
      const gasto: Gasto = {
        id: prev.nextIds.gasto,
        idCondominio: effectiveActiveCondominioId,
        concepto,
        categoria,
        monto,
        fecha: todayIso(),
      };

      return {
        ...prev,
        gastos: [gasto, ...prev.gastos],
        nextIds: {
          ...prev.nextIds,
          gasto: prev.nextIds.gasto + 1,
        },
      };
    });

    setGastoConcepto('');
    setGastoCategoria('');
    setGastoMonto('');
    runAction('Guardando gasto...', 'Gasto registrado con exito');
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        correo={correo}
        password={password}
        loginError={loginError}
        loadingLabel={loadingLabel}
        feedback={feedback}
        onCorreoChange={setCorreo}
        onPasswordChange={setPassword}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <DashboardPage
      role={role}
      sessionUser={sessionUser}
      navItems={navItems}
      activeView={activeView}
      menuOpen={menuOpen}
      appData={scopedData}
      condominiosDisponibles={condominiosDisponibles}
      activeCondominioId={effectiveActiveCondominioId ?? 0}
      panelStats={{
        avisos: avisosScoped.length,
        votaciones: votacionesScoped.length,
        cuotasPendientes: cuotasPendientes.length,
        mantenimientosAbiertos,
      }}
      cobranzaProgreso={cobranzaProgreso}
      cobranzaPagadas={cuotasPagadas}
      cobranzaTotal={cuotasScoped.length}
      panelReminders={panelReminders}
      saldoActual={saldoActual}
      balanceMensual={balanceMensual}
      pagosPendientesAdminCount={pagosPendientesAdmin.length}
      avisosRecientes={avisosScoped}
      votacionesActivas={votacionesScoped}
      gastosRecientes={gastosRecientes}
      falla={falla}
      avisoTitulo={avisoTitulo}
      avisoMensaje={avisoMensaje}
      votacionPregunta={votacionPregunta}
      gastoConcepto={gastoConcepto}
      gastoCategoria={gastoCategoria}
      gastoMonto={gastoMonto}
      loadingLabel={loadingLabel}
      feedback={feedback}
      onToggleMenu={() => setMenuOpen((prev: boolean) => !prev)}
      onChangeCondominio={handleCondominioChange}
      onCloseMenu={closeMobileMenu}
      onSetView={setActiveView}
      onLogout={cerrarSesion}
      onRegistrarPago={registrarPagoCondomino}
      onAprobarPago={aprobarPago}
      onRechazarPago={rechazarPago}
      onVotar={votar}
      onCrearVotacion={crearVotacion}
      onCerrarVotacion={cerrarVotacion}
      onPublicarAviso={publicarAviso}
      onFallaChange={setFalla}
      onAvisoTituloChange={setAvisoTitulo}
      onAvisoMensajeChange={setAvisoMensaje}
      onVotacionPreguntaChange={setVotacionPregunta}
      onEnviarReporteMantenimiento={enviarReporteMantenimiento}
      onActualizarEstadoMantenimiento={actualizarEstadoMantenimiento}
      onGastoConceptoChange={setGastoConcepto}
      onGastoCategoriaChange={setGastoCategoria}
      onGastoMontoChange={setGastoMonto}
      onRegistrarGasto={registrarGasto}
      onRunAction={runAction}
      formatShortDate={formatShortDate}
    />
  );
}

function App() {
  return (
    <ActiveCondominioProvider>
      <AppContent />
    </ActiveCondominioProvider>
  );
}

export default App;
