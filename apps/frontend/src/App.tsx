import { useMemo, useState } from 'react';
import { navAdministrador, navCondomino } from './constants/navigation';
import { statusLabel } from './constants/status';
import { formatShortDate, loadAppData, persistAppData, todayIso } from './lib/appData';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import type {
  AppData,
  Aviso,
  Cuota,
  CuotaStatus,
  DemoUser,
  Gasto,
  MantenimientoReporte,
  MantenimientoStatus,
  Pago,
  PagoStatus,
  RoleKey,
  ReporteFinanciero,
  ViewKey,
  VoteChoice,
} from './types/app';

function App() {
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

  const navItems = role === 'condomino' ? navCondomino : navAdministrador;

  const cuotasPendientes = useMemo(
    () => appData.cuotas.filter((cuota: Cuota) => cuota.status !== 'PAGADA'),
    [appData.cuotas],
  );

  const pagosPendientesAdmin = useMemo(
    () => appData.pagos.filter((pago: Pago) => pago.status === 'PENDIENTE'),
    [appData.pagos],
  );

  const avisos = useMemo(() => appData.avisos.slice().reverse(), [appData.avisos]);

  const gastosRecientes = useMemo(() => appData.gastos.slice().reverse().slice(0, 6), [appData.gastos]);

  const saldoActual = useMemo(() => {
    return cuotasPendientes.reduce((acc: number, cuota: Cuota) => acc + cuota.monto + cuota.recargo, 0);
  }, [cuotasPendientes]);

  const balanceMensual = useMemo(() => {
    const totalIngresos = appData.reportes.reduce((sum: number, reporte: ReporteFinanciero) => sum + reporte.ingresos, 0);
    const totalGastos = appData.gastos.reduce((sum: number, gasto: Gasto) => sum + gasto.monto, 0);
    return totalIngresos - totalGastos;
  }, [appData.gastos, appData.reportes]);

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

  const handleLogin = () => {
    const correoNormalizado = correo.trim().toLowerCase();
    const matchedUser = appData.users.find(
      (user: DemoUser) => user.correo === correoNormalizado && user.password === password,
    );

    if (!matchedUser) {
      setLoginError('Credenciales no validas. Revisa correo y contrasena.');
      return;
    }

    setLoginError(null);
    runAction('Iniciando sesion...', 'Bienvenido a Elyx');
    window.setTimeout(() => {
      setRole(matchedUser.role);
      setSessionUser(matchedUser);
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
    if (!sessionUser) {
      return;
    }

    patchAppData((prev) => {
      const cuota = prev.cuotas.find((item) => item.id === cuotaId);
      if (!cuota || cuota.status !== 'PENDIENTE') {
        return prev;
      }

      const updatedCuotas = prev.cuotas.map((item) =>
        item.id === cuotaId ? { ...item, status: 'EN_VALIDACION' as CuotaStatus } : item,
      );

      const nuevoPago: Pago = {
        id: prev.nextIds.pago,
        cuotaId,
        condominio: sessionUser.nombre,
        monto: cuota.monto,
        fecha: todayIso(),
        status: 'PENDIENTE',
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
    patchAppData((prev) => {
      const pago = prev.pagos.find((item) => item.id === idPago);
      if (!pago || pago.status !== 'PENDIENTE') {
        return prev;
      }

      return {
        ...prev,
        pagos: prev.pagos.map((item) => (item.id === idPago ? { ...item, status: 'APROBADO' as PagoStatus } : item)),
        cuotas: prev.cuotas.map((item) =>
          item.id === pago.cuotaId ? { ...item, status: 'PAGADA' as CuotaStatus, recargo: 0 } : item,
        ),
      };
    });

    runAction('Validando pago...', 'Pago validado con exito');
  };

  const rechazarPago = (idPago: number) => {
    patchAppData((prev) => {
      const pago = prev.pagos.find((item) => item.id === idPago);
      if (!pago || pago.status !== 'PENDIENTE') {
        return prev;
      }

      return {
        ...prev,
        pagos: prev.pagos.map((item) => (item.id === idPago ? { ...item, status: 'RECHAZADO' as PagoStatus } : item)),
        cuotas: prev.cuotas.map((item) =>
          item.id === pago.cuotaId ? { ...item, status: 'PENDIENTE' as CuotaStatus } : item,
        ),
      };
    });

    runAction('Actualizando estado...', 'Pago rechazado y notificado');
  };

  const publicarAviso = () => {
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
        titulo,
        mensaje,
        fecha: formatShortDate(todayIso()),
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

  const votar = (choice: VoteChoice) => {
    if (!sessionUser) {
      return;
    }

    patchAppData((prev) => {
      if (prev.votacionActiva.votosPorUsuario[sessionUser.correo]) {
        return prev;
      }

      const current = prev.votacionActiva;
      return {
        ...prev,
        votacionActiva: {
          ...current,
          aFavor: current.aFavor + (choice === 'favor' ? 1 : 0),
          enContra: current.enContra + (choice === 'contra' ? 1 : 0),
          votosPorUsuario: {
            ...current.votosPorUsuario,
            [sessionUser.correo]: choice,
          },
        },
      };
    });

    runAction('Registrando voto...', 'Voto registrado con exito');
  };

  const enviarReporteMantenimiento = () => {
    const descripcion = falla.trim();
    if (!descripcion || !sessionUser) {
      return;
    }

    patchAppData((prev) => {
      const nuevoReporte: MantenimientoReporte = {
        id: prev.nextIds.mantenimiento,
        unidad: sessionUser.nombre,
        descripcion,
        fecha: formatShortDate(todayIso()),
        estado: 'NUEVO',
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
    patchAppData((prev) => ({
      ...prev,
      mantenimientos: prev.mantenimientos.map((item) => (item.id === id ? { ...item, estado } : item)),
    }));
    runAction('Actualizando estado...', `Estado actualizado a ${statusLabel[estado]}`);
  };

  const registrarGasto = () => {
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

  const votoUsuario = sessionUser ? appData.votacionActiva.votosPorUsuario[sessionUser.correo] : undefined;

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
      appData={appData}
      saldoActual={saldoActual}
      balanceMensual={balanceMensual}
      pagosPendientesAdminCount={pagosPendientesAdmin.length}
      avisosRecientes={avisos}
      gastosRecientes={gastosRecientes}
      votoUsuario={votoUsuario}
      falla={falla}
      avisoTitulo={avisoTitulo}
      avisoMensaje={avisoMensaje}
      gastoConcepto={gastoConcepto}
      gastoCategoria={gastoCategoria}
      gastoMonto={gastoMonto}
      loadingLabel={loadingLabel}
      feedback={feedback}
      onToggleMenu={() => setMenuOpen((prev: boolean) => !prev)}
      onCloseMenu={closeMobileMenu}
      onSetView={setActiveView}
      onLogout={cerrarSesion}
      onRegistrarPago={registrarPagoCondomino}
      onAprobarPago={aprobarPago}
      onRechazarPago={rechazarPago}
      onVotar={votar}
      onPublicarAviso={publicarAviso}
      onFallaChange={setFalla}
      onAvisoTituloChange={setAvisoTitulo}
      onAvisoMensajeChange={setAvisoMensaje}
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

export default App;
