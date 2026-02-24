export type BlockEditorPreset = 'notes' | 'task';

export type BlockEditorUiConfig = {
  linkToolbar: boolean;
  slashMenu: boolean;
  sideMenu: boolean;
  filePanel: boolean;
  tableHandles: boolean;
  emojiPicker: boolean;
  comments: boolean;
  formattingToolbar: boolean;
};

const BASE_UI_CONFIG: BlockEditorUiConfig = {
  linkToolbar: false,
  slashMenu: false,
  sideMenu: false,
  filePanel: false,
  tableHandles: false,
  emojiPicker: false,
  comments: false,
  formattingToolbar: false,
};

export const resolveEditorUiConfig = (
  preset: BlockEditorPreset,
): BlockEditorUiConfig => {
  if (preset === 'notes') {
    return {
      ...BASE_UI_CONFIG,
      linkToolbar: true,
      sideMenu: true,
      filePanel: true,
      tableHandles: true,
    };
  }

  return BASE_UI_CONFIG;
};
