import { useState } from 'react';

export function useAsyncConfirmation<Arguments extends unknown[]>(
  action: (...args: Arguments) => Promise<boolean>,
  onSuccess: () => void,
) {
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState(false);

  async function confirm(...args: Arguments): Promise<void> {
    setSubmitting(true);
    setSubmissionError(false);
    try {
      if (await action(...args)) onSuccess();
      else setSubmissionError(true);
    } finally {
      setSubmitting(false);
    }
  }

  function clearSubmissionError() {
    setSubmissionError(false);
  }

  return { confirm, submitting, submissionError, clearSubmissionError };
}
