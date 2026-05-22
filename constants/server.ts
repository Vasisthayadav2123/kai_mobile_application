/**
 * Server configuration for the Flask backend.
 * Update SERVER_IP to match your Flask server's address.
 */

export const SERVER_IP = '192.168.1.38';

// Flask control API (media buttons)
export const SERVER_PORT = '5000';
export const SERVER_URL = `http://${SERVER_IP}:${SERVER_PORT}`;

// WebRTC signaling server (screen sharing)
export const WEBRTC_PORT = '8080';
export const WEBRTC_URL = `http://${SERVER_IP}:${WEBRTC_PORT}`;
