import { useEffect, useRef, useCallback, useState } from 'react';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  url: string;
  onMessage: (data: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnect?: boolean;
}

export function useWebSocket({ url, onMessage, onConnect, onDisconnect, reconnect = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const pendingMessagesRef = useRef<object[]>([]);
  const subscribedSessionsRef = useRef<Set<string>>(new Set());

  // Use refs for callbacks to prevent reconnection on callback changes
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
  }, [onMessage, onConnect, onDisconnect]);

  const getReconnectDelay = useCallback(() => {
    const baseDelay = 1000;
    const maxDelay = 30000;
    const multiplier = 2;
    const jitterFactor = 0.2;

    const delay = Math.min(baseDelay * Math.pow(multiplier, reconnectAttemptRef.current), maxDelay);
    const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
    reconnectAttemptRef.current++;
    return Math.round(delay + jitter);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;

      // Send any pending messages
      while (pendingMessagesRef.current.length > 0) {
        const msg = pendingMessagesRef.current.shift();
        if (msg) {
          ws.send(JSON.stringify(msg));
        }
      }

      // Re-subscribe to all tracked sessions
      for (const sessionId of subscribedSessionsRef.current) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
      }

      onConnectRef.current?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      onDisconnectRef.current?.();
      wsRef.current = null;

      if (reconnect) {
        const delay = getReconnectDelay();
        console.log(`Reconnecting in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('error');
    };

    wsRef.current = ws;
  }, [url, reconnect, getReconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      pendingMessagesRef.current.push(data);
    }
  }, []);

  const subscribe = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.add(sessionId);
    send({ type: 'subscribe', sessionId });
  }, [send]);

  const unsubscribe = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.delete(sessionId);
    send({ type: 'unsubscribe', sessionId });
  }, [send]);

  const sendInput = useCallback((sessionId: string, data: string) => {
    send({ type: 'input', sessionId, data });
  }, [send]);

  const resize = useCallback((sessionId: string, cols: number, rows: number) => {
    send({ type: 'resize', sessionId, cols, rows });
  }, [send]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    status,
    send,
    subscribe,
    unsubscribe,
    sendInput,
    resize,
    connect,
    disconnect,
  };
}
