import { Range, Uri, window } from 'vscode';
import { pathAccessible, createFile as create } from '../../utils/file';
import { getDatapackRoot, getDate, getNamespace, getResourcePath, isDatapackRoot } from '../../utils/common';
import { getTextEditor, listenInput, showError } from '../../utils/vscodeWrapper';
import path = require('path');
import { locale } from '../../locales';
import { getFileTemplate } from './utils';
import { TextEncoder } from 'util';
import { getFileType } from '../../types/FileTypes';
import { resolveVars, ContextContainer } from '../../types/ContextContainer';
import { codeConsole, config } from '../../extension';
import { GenerateError, NotOpenTextDocumentError, UserCancelledError } from '../../types/Error';
import { createMessageItemHasIds } from '../../types/MessageItemHasId';
import { createDatapack } from '../createDatapackTemplate/main';

export async function createFile(uri: Uri): Promise<void> {
    try {
        // Datapack内か確認
        const datapackRoot = await getDatapackRoot(uri.fsPath);
        if (!datapackRoot) throw new GenerateError(locale('create-file.not-datapack'));

        // ファイルの種類を取得
        const fileType = getFileType(uri.fsPath, datapackRoot);
        if (!fileType) {
            // 取得できない時の処理
            if (isDatapackRoot(datapackRoot)) {
                const res = await showError(
                    locale('create-file.unknown-filetype.listen-add', path.basename(datapackRoot)), false, createMessageItemHasIds('yes', 'no'), ['no']
                );
                if (res === 'yes') return await createDatapack('create-datapack-template.add', datapackRoot);
            }
            throw new GenerateError(locale('create-file.unknown-filetype'));
        }
        // ストラクチャはサポートしない
        if (fileType === 'structure') throw new GenerateError(locale('create-file.structure'));
        // 拡張子確定
        const fileExtname = fileType === 'function' ? 'mcfunction' : 'json';

        // ファイル名入力
        const fileName = await listenInput(locale('create-file.file-name', fileType), async v => {
            const invalidChar = v.match(/[^a-z0-9./_-]/g);
            if (invalidChar) return locale('error.unexpected-character', invalidChar.join(', '));
            if (await pathAccessible(path.join(uri.fsPath, `${v}.${fileExtname}`))) return locale('create-file.already-exists', `${v}.${fileExtname}`);
            return undefined;
        });

        // リソースパスの生成とファイルテンプレートの取得
        const filePath = path.join(uri.fsPath, `${fileName}.${fileExtname}`);

        const ctxContainer: ContextContainer = {
            datapackName: path.basename(datapackRoot),
            namespace: getNamespace(filePath, datapackRoot),

            fileResourcePath: getResourcePath(filePath, datapackRoot, fileType),
            fileName,
            fileType,
            fileExtname,

            date: getDate(config.dateFormat),
            cursor: ''
        };

        try {
            const openFilePath = getTextEditor().document.uri.fsPath;
            const nowOpenFileType = getFileType(path.dirname(openFilePath), datapackRoot);
            ctxContainer.nowOpenFileType = nowOpenFileType ?? '';
            ctxContainer.nowOpenFileResourcePath = getResourcePath(openFilePath, datapackRoot, nowOpenFileType) ?? '';
            ctxContainer.nowOpenFileName = openFilePath.match(/([^/\\]*(?=\.(?!.*\.))|(?<=^|(?:\/|\\))[^./\\]*$)/)?.shift() ?? '';
            ctxContainer.nowOpenFileExtname = openFilePath.match(/(?<=\.)[^./\\]*?$/)?.shift() ?? '';
        } catch (error) {
            if (!(error instanceof NotOpenTextDocumentError)) throw error;
        }

        const fileTemplate = getFileTemplate(config.createFile.fileTemplate, fileType);
        let selection: Range | undefined;
        fileTemplate.forEach((v, i) => {
            const res = v.search(/%cursor%/i);
            if (res !== -1) selection = new Range(i, res, i, res);
        });

        // 生成
        await create(filePath, new TextEncoder().encode(resolveVars(fileTemplate.join('\r\n'), ctxContainer)));
        // ファイルを開く
        await window.showTextDocument(Uri.file(filePath), { selection });
    } catch (error) {
        if (error instanceof UserCancelledError) return;
        if (error instanceof Error) showError(error.message);
        else showError(error.toString());
        codeConsole.appendLine(error.stack ?? error.toString());
    }
}