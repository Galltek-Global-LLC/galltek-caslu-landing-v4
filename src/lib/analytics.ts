import { UTMParams } from './utm-tracker';

declare global {
  interface Window {
    dataLayer: any[];
  }
}

const pushToDataLayer = (data: any) => {
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(data);
  }
};

export const trackFormStart = (formName: string) => {
  pushToDataLayer({
    event: 'form_start',
    form_name: formName,
    timestamp: new Date().toISOString(),
  });
};

export const trackFieldCompleted = (fieldName: string, formName: string) => {
  pushToDataLayer({
    event: 'form_field_completed',
    form_name: formName,
    field_name: fieldName,
    timestamp: new Date().toISOString(),
  });
};

export const trackFormSuccess = (
  formName: string,
  transactionId: string,
  utms?: UTMParams,
  userData?: { name?: string; email?: string; phone?: string }
) => {
  pushToDataLayer({
    event: 'form_success',
    form_name: formName,
    transaction_id: transactionId,
    timestamp: new Date().toISOString(),
    ...(userData && { userData }),
    ...utms,
  });
};

export const trackFormError = (
  formName: string,
  errorMessage: string,
  errorType?: string
) => {
  pushToDataLayer({
    event: 'form_error',
    form_name: formName,
    error_message: errorMessage,
    error_type: errorType || 'submission_error',
    timestamp: new Date().toISOString(),
  });
};

export const trackFormAbandonment = (
  formName: string,
  filledFields: string[],
  timeSpent: number
) => {
  pushToDataLayer({
    event: 'form_abandoned',
    form_name: formName,
    filled_fields: filledFields,
    time_spent_seconds: timeSpent,
    timestamp: new Date().toISOString(),
  });
};

export const setupFormAbandonmentTracking = (
  formName: string,
  getFilledFields: () => string[]
): (() => void) => {
  const startTime = Date.now();
  let tracked = false;

  const handleBeforeUnload = () => {
    if (!tracked) {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      const filledFields = getFilledFields();

      if (filledFields.length > 0) {
        trackFormAbandonment(formName, filledFields, timeSpent);
        tracked = true;
      }
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
};

export const setupPageEngagementTracking = (
  pageName: string,
  engagementThresholdSeconds: number = 10,
  transactionId?: string
): (() => void) => {
  const startTime = Date.now();

  const engagementTimer = setTimeout(() => {
    const secondsOnPage = Math.floor((Date.now() - startTime) / 1000);
    pushToDataLayer({
      event: 'page_engagement',
      page_name: pageName,
      seconds_on_page: secondsOnPage,
      transaction_id: transactionId,
      timestamp: new Date().toISOString(),
    });
  }, engagementThresholdSeconds * 1000);

  const handleBeforeUnload = () => {
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    pushToDataLayer({
      event: 'page_exit',
      page_name: pageName,
      total_time_seconds: totalTime,
      transaction_id: transactionId,
      timestamp: new Date().toISOString(),
    });
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    clearTimeout(engagementTimer);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
};
