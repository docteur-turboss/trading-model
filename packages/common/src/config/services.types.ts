/** Well-known service instance identifiers used across the system. */
export const ServiceInstanceName = {
  CoreBalancerService: 'core-balancer-service',
  DiscoveryService: 'discovery-service',
  FinancialScrapperService: 'financial-scrapper-service',
  MessageDeliveryService: 'message-delivery-service',
  OfficialDataScrapperService: 'official-data-scrapper-service',
  OnlineScrapperService: 'online-scrapper-service',
  PredictPriceService: 'predict-price-service',
  RiskAnalysisService: 'risk-analysis-service',
  TraderTrainingService: 'trader-training-service',
} as const;

export type ServiceInstanceName = (typeof ServiceInstanceName)[keyof typeof ServiceInstanceName];
