/**
 * Paging of the public winners page (`GET /events/public/winners`, event-service
 * `ListPublishedWinners`). Shared so the gateway and event-service validate the same.
 * The page size counts events, not winners.
 */
export const DEFAULT_PUBLISHED_WINNERS_LIMIT = 10;
export const MAX_PUBLISHED_WINNERS_LIMIT = 50;
