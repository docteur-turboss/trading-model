// API publique :
// findService(serviceName: string): Promise<ServiceInstance>

// Algorithme :
// Cherche dans le cache local
// Si absent → demande à l’Address Manager
// Ping l’adresse obtenue
// Si ping OK → retourne
// Si ping KO :
// Invalide le cache
// Redemande une nouvelle adresse
// Ping à nouveau
// Si OK → retourne
// Sinon → erreur explicite
// Important
// Aucun accès direct au HTTP client
// Tout passe par des abstractions