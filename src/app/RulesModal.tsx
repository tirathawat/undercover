import { Button } from '../design-system/Button';
import { Modal } from '../design-system/Modal';
import { useTranslation } from '../i18n';

export function RulesModal({ close }: { close: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('rules.title')}
      close={close}
      closeLabel={t('common.close')}
    >
      <ol className="rules-list">
        <li>
          <strong>{t('rules.inviteTitle')}</strong>
          <p>{t('rules.inviteDescription')}</p>
        </li>
        <li>
          <strong>{t('rules.secretTitle')}</strong>
          <p>{t('rules.secretDescription')}</p>
        </li>
        <li>
          <strong>{t('rules.clueTitle')}</strong>
          <p>{t('rules.clueDescription')}</p>
        </li>
        <li>
          <strong>{t('rules.voteTitle')}</strong>
          <p>{t('rules.voteDescription')}</p>
        </li>
        <li>
          <strong>{t('rules.winnerTitle')}</strong>
          <p>{t('rules.civilianWin')}</p>
          <p>{t('rules.undercoverWin')}</p>
          <p>{t('rules.whiteGuyWin')}</p>
        </li>
      </ol>
      <div className="rules-note">{t('rules.recovery')}</div>
      <Button onClick={close}>{t('rules.close')}</Button>
    </Modal>
  );
}
