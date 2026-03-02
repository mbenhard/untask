/**
 * Re-export barrel — all consumers continue to import from this path.
 *
 * The implementation has been split into focused slices under ./chat/.
 */
export {
  useChatStore,
  selectChatMessages,
  selectChatConversations,
  selectChatConversationsTotal,
  selectChatActiveConversationId,
  selectChatIsLoadingConversations,
  selectChatIsSending,
  selectChatError,
  selectChatLastStreamError,
  selectChatModels,
  selectChatSelectedModelId,
  selectChatRetentionMode,
  selectAutonomyMode,
  selectPendingActions,
  selectPendingImages,
  selectProcessingImageCount,
  selectFocusMessageId,
  selectPendingNoteContext,
  selectNoteHintDismissedForConversationId,
} from './chat';

export type { ChatStore } from './chat';
