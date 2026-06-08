/** Well-known service instance identifiers used across the system. */
export const ServiceInstanceName = {
  CoreBalancerService: 'core-balancer-service',
  DiscoveryService: 'discovery-service',
  FinancialScraperService: 'financial-scraper-service',
  MessageDeliveryService: 'message-delivery-service',
  OfficialDataScraperService: 'official-data-scraper-service',
  OnlineScraperService: 'online-scraper-service',
  PredictPriceService: 'predict-price-service',
  RiskAnalysisService: 'risk-analysis-service',
  TraderTrainingService: 'trader-training-service',
} as const;

export type ServiceInstanceName = (typeof ServiceInstanceName)[keyof typeof ServiceInstanceName];
