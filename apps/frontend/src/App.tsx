import { useEffect, useMemo, useState } from 'react';
import { navAdministrador, navCondomino } from './constants/navigation';
import { statusLabel } from './constants/status';
import { ActiveCondominioProvider, useActiveCondominio } from './contexts/ActiveCondominioContext';
import { formatShortDate, seedData } from './lib/appData';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { backendApi } from './services/backendApi.service';
import {
  closeVotacionInCondominio,
  getCobranzaProgreso,
  getCondominioScope,
  getVotacionesPendientes,
  voteInCondominio,
  type CondominioScope,
} from './services/multiCondominio.service';
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

const EMPTY_SCOPE: CondominioScope = {
  cuotas: [],
  pagos: [],
  avisos: [],
  votacionesActivas: [],
  mantenimientos: [],
  gastos: [],
  reportes: [],
};

function AppContent() {
  const { activeCondominioId, setActiveCondominioId } = useActiveCondominio();

  const [appData, setAppData] = useState<AppData>(() => seedData());
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

  const condominioScope = useMemo(() => {
    if (!effectiveActiveCondominioId) {
      return EMPTY_SCOPE;
    }

    return getCondominioScope(appData, effectiveActiveCondominioId);
  }, [appData, effectiveActiveCondominioId]);

  const {
    cuotas: cuotasScoped,
    pagos: pagosScoped,
    avisos: avisosScoped,
    votacionesActivas: votacionesScoped,
    mantenimientos: mantenimientosScoped,
    gastos: gastosScoped,
    reportes: reportesScoped,
  } = condominioScope;

  const cuotasPendientes = useMemo(
    () => cuotasScoped.filter((cuota: Cuota) => cuota.status !== 'PAGADA'),
    [cuotasScoped],
  );

  const pagosPendientesAdmin = useMemo(
    () => pagosScoped.filter((pago: Pago) => pago.status === 'PENDIENTE'),
    [pagosScoped],
  );

  const cobranzaResumen = useMemo(() => getCobranzaProgreso(cuotasScoped), [cuotasScoped]);
  const cuotasPagadas = cobranzaResumen.pagadas;
  const cobranzaProgreso = cobranzaResumen.porcentaje;

  const votacionesPendientesUsuario = useMemo(() => {
    if (!sessionUser) {
      return 0;
    }

    return getVotacionesPendientes(votacionesScoped, sessionUser.correo);
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
    setAppData((prev: AppData) => updater(prev));
  };

  useEffect(() => {
    if (!isAuthenticated || !effectiveActiveCondominioId) {
      return;
    }

    let isCancelled = false;

    const syncScopeFromBackend = async () => {
      try {
        const [cuotasApi, avisosApi, votacionesApi, pagosApi, mantenimientosApi, gastosApi, reportesApi] = await Promise.all([
          backendApi.listCuotas(effectiveActiveCondominioId),
          backendApi.listAvisos(effectiveActiveCondominioId),
          backendApi.listVotaciones(effectiveActiveCondominioId),
          backendApi.listPagos(effectiveActiveCondominioId),
          backendApi.listReportesMantenimiento(effectiveActiveCondominioId),
          backendApi.listGastos(effectiveActiveCondominioId),
          backendApi.listReportesFinancieros(effectiveActiveCondominioId),
        ]);

        if (isCancelled) {
          return;
        }

        setAppData((prev: AppData) => {
          const votosPrevios = new Map(
            prev.votacionesActivas
              .filter((item: VotacionActiva) => item.idCondominio === effectiveActiveCondominioId)
              .map((item: VotacionActiva) => [item.id, item.votosPorUsuario]),
          );

          const votacionesMerge = votacionesApi.map((item) => ({
            ...item,
            votosPorUsuario: votosPrevios.get(item.id) ?? {},
          }));

          const next: AppData = {
            ...prev,
            cuotas: [...prev.cuotas.filter((item: Cuota) => item.idCondominio !== effectiveActiveCondominioId), ...cuotasApi],
            avisos: [...prev.avisos.filter((item: Aviso) => item.idCondominio !== effectiveActiveCondominioId), ...avisosApi],
            pagos: [...prev.pagos.filter((item: Pago) => item.idCondominio !== effectiveActiveCondominioId), ...pagosApi],
            votacionesActivas: [
              ...prev.votacionesActivas.filter(
                (item: VotacionActiva) => item.idCondominio !== effectiveActiveCondominioId,
              ),
              ...votacionesMerge,
            ],
            mantenimientos: [
              ...prev.mantenimientos.filter((item: MantenimientoReporte) => item.idCondominio !== effectiveActiveCondominioId),
              ...mantenimientosApi,
            ],
            gastos: [...prev.gastos.filter((item: Gasto) => item.idCondominio !== effectiveActiveCondominioId), ...gastosApi],
            reportes: [
              ...prev.reportes.filter((item: ReporteFinanciero) => item.idCondominio !== effectiveActiveCondominioId),
              ...reportesApi,
            ],
          };
          return next;
        });
      } catch (error) {
        console.error('No se pudo sincronizar con backend para el condominio activo:', error);
      }
    };

    void syncScopeFromBackend();

    return () => {
      isCancelled = true;
    };
  }, [effectiveActiveCondominioId, isAuthenticated]);

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

  const registrarPagoCondomino = async (cuotaId: number) => {
    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const pago = await backendApi.capturarPago({
        idCondominio: effectiveActiveCondominioId,
        idCuota: cuotaId,
        idUsuarioCondominioPaga: activeMembership.idUsuarioCondominio,
      });

      patchAppData((prev) => ({
        ...prev,
        pagos: [pago, ...prev.pagos],
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === cuotaId && item.idCondominio === effectiveActiveCondominioId
            ? { ...item, status: 'EN_VALIDACION' as CuotaStatus }
            : item,
        ),
      }));

      runAction('Registrando pago...', 'Pago enviado para validacion');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo registrar el pago en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const aprobarPago = async (idPago: number) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const pagoActualizado = await backendApi.aprobarPago({
        idCondominio: effectiveActiveCondominioId,
        idPago,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
      });

      patchAppData((prev) => ({
        ...prev,
        pagos: prev.pagos.map((item: Pago) => (item.id === idPago ? pagoActualizado : item)),
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === pagoActualizado.cuotaId ? { ...item, status: 'PAGADA' as CuotaStatus, recargo: 0 } : item,
        ),
      }));

      runAction('Validando pago...', 'Pago validado con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo validar el pago en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const rechazarPago = async (idPago: number) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const pagoActualizado = await backendApi.rechazarPago({
        idCondominio: effectiveActiveCondominioId,
        idPago,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        motivoRechazo: 'No cumple validacion documental',
      });

      patchAppData((prev) => ({
        ...prev,
        pagos: prev.pagos.map((item: Pago) => (item.id === idPago ? pagoActualizado : item)),
        cuotas: prev.cuotas.map((item: Cuota) =>
          item.id === pagoActualizado.cuotaId ? { ...item, status: 'PENDIENTE' as CuotaStatus } : item,
        ),
      }));

      runAction('Actualizando estado...', 'Pago rechazado y notificado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo rechazar el pago en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const publicarAviso = async () => {
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

    try {
      const nuevoAviso = await backendApi.createAviso({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        titulo,
        contenido: mensaje,
      });

      patchAppData((prev) => ({
        ...prev,
        avisos: [...prev.avisos, nuevoAviso],
      }));

      setAvisoTitulo('');
      setAvisoMensaje('');
      runAction('Publicando aviso...', 'Aviso publicado con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo publicar el aviso en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const votar = async (votacionId: number, choice: VoteChoice) => {
    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const resumen = await backendApi.votar({
        idCondominio: effectiveActiveCondominioId,
        idVotacion: votacionId,
        idUsuarioCondominio: activeMembership.idUsuarioCondominio,
        choice,
      });

      patchAppData((prev) =>
        voteInCondominio(
          {
            ...prev,
            votacionesActivas: prev.votacionesActivas.map((item) =>
              item.id === votacionId
                ? {
                    ...item,
                    aFavor: resumen.aFavor,
                    enContra: resumen.enContra,
                  }
                : item,
            ),
          },
          {
            idCondominio: effectiveActiveCondominioId,
            idVotacion: votacionId,
            correoUsuario: sessionUser.correo,
            choice,
          },
        ),
      );

      runAction('Registrando voto...', 'Voto registrado con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo registrar el voto en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const crearVotacion = async () => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const pregunta = votacionPregunta.trim();
    if (pregunta.length < 10) {
      setFeedback('La pregunta de votacion debe tener al menos 10 caracteres');
      window.setTimeout(() => setFeedback(null), 2200);
      return;
    }

    try {
      const votacion = await backendApi.createVotacion({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        pregunta,
      });

      patchAppData((prev) => ({
        ...prev,
        votacionesActivas: [votacion, ...prev.votacionesActivas],
      }));

      setVotacionPregunta('');
      runAction('Publicando votacion...', 'Votacion creada con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo crear la votacion en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const cerrarVotacion = async (votacionId: number) => {
    if (!effectiveActiveCondominioId) {
      return;
    }

    try {
      await backendApi.cerrarVotacion({
        idCondominio: effectiveActiveCondominioId,
        idVotacion: votacionId,
      });

      patchAppData((prev) =>
        closeVotacionInCondominio(prev, {
          idCondominio: effectiveActiveCondominioId,
          idVotacion: votacionId,
        }),
      );

      runAction('Cerrando votacion...', 'Votacion cerrada y archivada');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo cerrar la votacion en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const enviarReporteMantenimiento = async () => {
    if (!sessionUser || !effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    const descripcion = falla.trim();
    if (!descripcion) {
      return;
    }

    try {
      const reporte = await backendApi.createReporteMantenimiento({
        idCondominio: effectiveActiveCondominioId,
        idUsuarioCondominioReporta: activeMembership.idUsuarioCondominio,
        unidad: sessionUser.nombre,
        descripcion,
      });

      patchAppData((prev) => ({
        ...prev,
        mantenimientos: [reporte, ...prev.mantenimientos],
      }));

      setFalla('');
      runAction('Enviando reporte...', 'Reporte de mantenimiento enviado');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo enviar el reporte en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const actualizarEstadoMantenimiento = async (id: number, estado: MantenimientoStatus) => {
    if (!effectiveActiveCondominioId || !activeMembership) {
      return;
    }

    try {
      const actualizado = await backendApi.updateReporteMantenimientoEstado({
        idCondominio: effectiveActiveCondominioId,
        idReporte: id,
        idUsuarioCondominioAdmin: activeMembership.idUsuarioCondominio,
        estado,
      });

      patchAppData((prev) => ({
        ...prev,
        mantenimientos: prev.mantenimientos.map((item: MantenimientoReporte) =>
          item.id === id && item.idCondominio === effectiveActiveCondominioId ? actualizado : item,
        ),
      }));

      runAction('Actualizando estado...', `Estado actualizado a ${statusLabel[estado]}`);
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo actualizar el estado en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
  };

  const registrarGasto = async () => {
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

    try {
      const gasto = await backendApi.createGasto({
        idCondominio: effectiveActiveCondominioId,
        concepto,
        categoria,
        monto,
      });

      patchAppData((prev) => ({
        ...prev,
        gastos: [gasto, ...prev.gastos],
      }));

      setGastoConcepto('');
      setGastoCategoria('');
      setGastoMonto('');
      runAction('Guardando gasto...', 'Gasto registrado con exito');
    } catch (error) {
      console.error(error);
      setFeedback('No se pudo registrar el gasto en backend');
      window.setTimeout(() => setFeedback(null), 2200);
    }
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
      cobranzaTotal={cobranzaResumen.total}
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
