import type { Response } from 'express';

import type { UserRole } from '@/modules/auth/user.model';

import type { NotificationEntity } from './notification.entity';

interface SseClient {
  id: number;
  res: Response;
  userId: string;
  role: UserRole;
}

/**
 * Hub Server-Sent Events : registre des clients connectés + diffusion.
 *
 * Couche transport (manipule des `Response` HTTP) — volontairement séparée du
 * service métier. Le service décide QUOI émettre ; le hub sait À QUI et COMMENT
 * l'écrire sur le fil SSE.
 */
export class NotificationHub {
  private readonly clients = new Map<number, SseClient>();
  private nextId = 1;
  private heartbeat: NodeJS.Timeout | null = null;

  /** Enregistre une connexion SSE et renvoie son identifiant interne. */
  public register(res: Response, user: { id: string; role: UserRole }): number {
    const id = this.nextId++;
    this.clients.set(id, { id, res, userId: user.id, role: user.role });
    return id;
  }

  public unregister(id: number): void {
    this.clients.delete(id);
  }

  public clientCount(): number {
    return this.clients.size;
  }

  /**
   * Diffuse une notification aux seuls clients dont le rôle est dans l'audience
   * (audience vide = tout le monde). Un client mort est retiré silencieusement.
   */
  public broadcast(notification: NotificationEntity): void {
    const payload = JSON.stringify(notification.toJSON());
    const audience = notification.audience;

    for (const client of this.clients.values()) {
      if (audience.length > 0 && !audience.includes(client.role)) continue;
      try {
        client.res.write(`event: notification\ndata: ${payload}\n\n`);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  /** Commentaire keep-alive périodique — évite la coupure par les proxies. */
  public startHeartbeat(intervalMs = 25_000): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const client of this.clients.values()) {
        try {
          client.res.write(': ping\n\n');
        } catch {
          this.clients.delete(client.id);
        }
      }
    }, intervalMs);
    this.heartbeat.unref();
  }

  /** Stoppe le heartbeat et ferme proprement toutes les connexions. */
  public stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const client of this.clients.values()) {
      client.res.end();
    }
    this.clients.clear();
  }
}

/** Singleton partagé entre le service (émission) et le contrôleur (connexion). */
export const notificationHub = new NotificationHub();
