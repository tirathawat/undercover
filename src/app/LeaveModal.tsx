import { LogOut } from 'lucide-react';
import { Button } from '../design-system/Button';
import { Modal } from '../design-system/Modal';
import { useTranslation } from '../i18n';
import { useAsyncConfirmation } from '../hooks/use-async-confirmation';

export function LeaveModal({
  disabled,
  close,
  leave,
}: {
  disabled: boolean;
  close: () => void;
  leave: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { confirm, submitting, submissionError } = useAsyncConfirmation(
    leave,
    close,
  );
  return (
    <Modal
      title={submitting ? t('leave.pendingTitle') : t('leave.title')}
      close={close}
      closeLabel={t('common.close')}
      busy={submitting}
    >
      <p className="leave-description">{t('leave.description')}</p>
      {submissionError && (
        <p className="error-banner" role="alert">
          {t('leave.failure')}
        </p>
      )}
      <div className="modal-actions">
        <Button variant="secondary" disabled={submitting} onClick={close}>
          {submissionError ? t('common.closeDialog') : t('leave.stay')}
        </Button>
        <Button
          variant="danger"
          disabled={disabled || submitting}
          onClick={() => confirm()}
        >
          {submitting ? t('leave.pendingAction') : t('leave.action')}{' '}
          <LogOut size={17} />
        </Button>
      </div>
    </Modal>
  );
}
