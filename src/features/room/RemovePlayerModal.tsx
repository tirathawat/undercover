import { Button } from '../../design-system/Button';
import { Modal } from '../../design-system/Modal';
import { useTranslation } from '../../i18n';

interface Props {
  removedName: string;
  isLobby: boolean;
  disabled: boolean;
  submitting: boolean;
  submissionError: boolean;
  close: () => void;
  confirm: () => Promise<void>;
}

export function RemovePlayerModal({
  removedName,
  isLobby,
  disabled,
  submitting,
  submissionError,
  close,
  confirm,
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      title={
        submitting
          ? t('removePlayer.pendingTitle', { name: removedName })
          : t('removePlayer.title', { name: removedName })
      }
      close={close}
      closeLabel={t('common.close')}
      busy={submitting}
    >
      <p className="leave-description">
        {isLobby
          ? t('removePlayer.lobbyDescription')
          : t('removePlayer.gameDescription')}
      </p>
      {submissionError && (
        <p className="error-banner" role="alert">
          {t('removePlayer.failure')}
        </p>
      )}
      <div className="modal-actions">
        <Button variant="secondary" disabled={submitting} onClick={close}>
          {submissionError ? t('common.closeDialog') : t('removePlayer.cancel')}
        </Button>
        <Button
          variant="danger"
          disabled={disabled || submitting}
          onClick={confirm}
        >
          {submitting
            ? t('removePlayer.pendingAction')
            : t('removePlayer.action')}
        </Button>
      </div>
    </Modal>
  );
}
