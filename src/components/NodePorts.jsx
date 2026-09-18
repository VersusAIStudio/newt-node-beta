export function PortHandle({ node, port, side, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  const connected = connectedPortKeys.has(`${node.id}:${port.id}`);
  const disabled = Boolean(port.disabled);

  return (
    <button
      className={`inline-port ${side} ${connected ? "connected" : ""} ${disabled ? "disabled" : ""}`}
      data-port-role={side}
      data-node-id={node.id}
      data-port-id={port.id}
      data-port-key={`${node.id}:${port.id}`}
      style={{ "--port-color": port.color }}
      onPointerDown={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (side === "output") {
          onConnectStart(event, node.id, port.id, port.color);
          return;
        }
        onDisconnectInput(event, node.id, port.id);
      }}
      disabled={disabled}
      title={disabled ? port.disabledReason || `${port.label} is not supported` : side === "input" ? `Disconnect ${port.label}` : `Connect ${port.label}`}
    />
  );
}

export function OutputPortRow({ node, port, onConnectStart, onDisconnectInput, connectedPortKeys, label = port.label }) {
  return (
    <div className="port-row output-row">
      {label ? <span>{label}</span> : <span aria-hidden="true" />}
      <PortHandle
        node={node}
        port={port}
        side="output"
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    </div>
  );
}

export function CollapsedInputPorts({ node, ports, onExpand, connectedPortKeys }) {
  const connected = ports.some(port => connectedPortKeys.has(`${node.id}:${port.id}`));
  return <span className="collapsed-input-ports">
    {/* Keep every typed edge anchored without making the aggregate an ambiguous drop target. */}
    {ports.map(port => <span key={port.id} aria-hidden="true" data-port-key={`${node.id}:${port.id}`} />)}
    <button className={`inline-port input ${connected ? "connected" : ""}`} style={{ "--port-color": "#929292" }}
      aria-label="Expand references" title="Expand references to connect or disconnect assets"
      onPointerDown={event => event.stopPropagation()} onClick={onExpand} />
  </span>;
}

export function NodeRow({ label, children, inputPort, node, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div className={`node-row ${inputPort ? "has-port" : ""} ${inputPort?.disabled ? "disabled" : ""}`}>
      <span className="node-row-label">
        {inputPort && (
          <PortHandle
            node={node}
            port={inputPort}
            side="input"
            onConnectStart={onConnectStart}
            onDisconnectInput={onDisconnectInput}
            connectedPortKeys={connectedPortKeys}
          />
        )}
        <span>{label}</span>
      </span>
      {children}
    </div>
  );
}
