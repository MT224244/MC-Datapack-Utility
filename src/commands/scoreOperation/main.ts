import '../../utils/methodExtensions';
import { codeConsole, config } from '../../extension';
import { getTextEditor, listenInput, showError } from '../../utils/vscodeWrapper';
import { rpnToScoreOperation } from './utils/converter';
import { formulaAnalyzer } from './utils/formula';
import { locale } from '../../locales';
import { opTable } from './types/OperateTable';
import { NotOpenTextDocumentError, UserCancelledError } from '../../types/Error';
import { IfFormula } from './types/Formula';
import rfdc from 'rfdc';

export async function scoreOperation(): Promise<void> {
    const { objective, forceInputType } = config.scoreOperation;
    try {
        const editor = getTextEditor();

        const operateTable = rfdc()(opTable);
        config.scoreOperation.customOperate.forEach(e => {
            operateTable[e.identifier] = e;
        });

        let text = '';
        if (forceInputType !== 'Always InputBox') text = editor.document.getText(editor.selection);
        // セレクトされていないならInputBoxを表示
        if (text === '') {
            if (forceInputType === 'Always Selection') {
                showError(locale('formula-to-score-operation.not-selection'));
                return;
            }
            const res = await listenInput(locale('formula-to-score-operation.formula'));
            if (!res) return;
            text = res;
        }

        const ifStates: IfFormula[] = [];
        const formula = formulaAnalyzer(text.split(' '), operateTable, ifStates);
        const result = await rpnToScoreOperation(formula, config.scoreOperation, ifStates, operateTable);
        if (!result) return;

        const { resValues, resFormulas } = result;
        editor.edit(edit => {
            edit.replace(editor.selection, [
                `# ${text}`,
                `# ${locale('formula-to-score-operation.complate-text')}`,
                `scoreboard objectives add ${objective} dummy`,
                Array.from(resValues).join('\r\n'),
                '',
                resFormulas.join('\r\n')
            ].join('\r\n'));
        });
    } catch (error) {
        if (error instanceof UserCancelledError || error instanceof NotOpenTextDocumentError) return;
        if (error instanceof Error) showError(error.message);
        else showError(error.toString());
        codeConsole.appendLine(error.stack ?? error.toString());
    }
}