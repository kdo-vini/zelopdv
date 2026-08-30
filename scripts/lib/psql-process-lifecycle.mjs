function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addStdinErrorListener(handle) {
  if (handle.stdinErrorListenerAdded) return;
  const stdin = handle?.child?.stdin;
  if (!stdin) return;
  handle.stdinErrors ??= [];
  stdin.on('error', (error) => handle.stdinErrors.push(error));
  handle.stdinErrorListenerAdded = true;
}

export function throwCollectedFailures(primaryFailure, followupFailures, message) {
  const failures = [
    ...(primaryFailure ? [primaryFailure] : []),
    ...followupFailures,
  ];
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, message);
}

export function createPsqlProcessLifecycle({
  timeoutMs,
  spawnImpl,
  platform = process.platform,
  delayFn = defaultDelay,
}) {
  async function waitForExit(handle, timeout = timeoutMs) {
    if (!handle) return null;
    const result = await Promise.race([handle.done, delayFn(timeout).then(() => null)]);
    return result && handle.closed() ? result : null;
  }

  function endStdin(handle, text = '') {
    const stdin = handle?.child?.stdin;
    if (!stdin || handle.stdinEndRequested || stdin.destroyed || stdin.writableEnded) return false;
    addStdinErrorListener(handle);
    handle.stdinEndRequested = true;
    try {
      stdin.end(text);
      return true;
    } catch (error) {
      handle.stdinErrors.push(error);
      return false;
    }
  }

  function writeStdin(handle, text) {
    const stdin = handle?.child?.stdin;
    if (!stdin || handle.stdinEndRequested || stdin.destroyed || stdin.writableEnded) return false;
    addStdinErrorListener(handle);
    try {
      return stdin.write(text);
    } catch (error) {
      handle.stdinErrors.push(error);
      return false;
    }
  }

  async function runTaskkill(child, label) {
    let killer;
    const complete = new Promise((resolve) => {
      killer = spawnImpl('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore', windowsHide: true,
      });
      killer.once('error', (error) => resolve({ error }));
      killer.once('close', (code) => resolve({ code }));
    });
    let result = await Promise.race([complete, delayFn(500).then(() => null)]);
    if (result === null) {
      try { killer?.kill('SIGKILL'); } catch { /* best-effort killer shutdown */ }
      result = await Promise.race([complete, delayFn(500).then(() => null)]);
    }
    if (result === null) throw new Error(`taskkill não encerrou dentro do timeout: ${label}`);
    if (result.error) throw new Error(`taskkill falhou: ${label}: ${result.error.message}`);
  }

  async function terminatePsql(handle, label) {
    if (!handle) return null;
    let result = await waitForExit(handle, 0);
    if (result) return result;
    try { handle.child.kill('SIGTERM'); } catch { /* process may have exited between checks */ }
    result = await waitForExit(handle, 500);
    if (result) return result;
    if (platform === 'win32') await runTaskkill(handle.child, label);
    else {
      try { handle.child.kill('SIGKILL'); } catch { /* process may have exited between checks */ }
    }
    result = await waitForExit(handle, 500);
    if (!result) throw new Error(`não foi possível confirmar o encerramento de psql: ${label}`);
    return result;
  }

  async function waitForProcess(handle, label) {
    const result = await waitForExit(handle);
    if (result) return result;
    await terminatePsql(handle, label);
    throw new Error(`timeout aguardando ${label}; processo psql encerrado`);
  }

  async function finalizePsql(handle, label) {
    if (!handle) return null;
    endStdin(handle, 'rollback;\n\\q\n');
    const result = await waitForExit(handle);
    const exited = result ?? await terminatePsql(handle, label);
    if (!exited || !handle.closed()) throw new Error(`psql não confirmou saída durante finalização: ${label}`);
    if (handle.stdinErrors?.length) {
      throw new AggregateError(handle.stdinErrors, `erro no stdin de psql durante finalização: ${label}`);
    }
    return exited;
  }

  return { endStdin, writeStdin, waitForProcess, terminatePsql, finalizePsql };
}
