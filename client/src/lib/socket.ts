import { io, Socket } from 'socket.io-client';
import { getServerUrl } from './serverUrl';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socketInstance;
}
