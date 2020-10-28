import { workspace, window, Uri } from 'vscode';
import { getDatapackRoot, getDate, getResourcePath, isDatapackRoot, showInputBox } from '../../utils/common';
import path from 'path';
import { TextEncoder } from 'util';
import '../../utils/methodExtensions';
import { getPackMcMetaData, getPickItems } from './types/Items';
import * as file from '../../utils/file';
import { locale } from '../../locales';
import { createMessageItemsHasId } from './types/MessageItems';
import { resolveVars, VariableContainer } from '../../types/VariableContainer';
import { getFileType } from '../../types/FileTypes';

export async function createDatapack(): Promise<void> {
    // フォルダ選択
    const dir = await window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: workspace.workspaceFolders?.[0].uri,
        openLabel: locale('create-datapack-template.dialog-label'),
        title: locale('create-datapack-template.dialog-title')
    }).then(v => v?.[0]);
    if (!dir) return;

    // Datapack内部かチェック
    const datapackRoot = await getDatapackRoot(dir.fsPath);
    if (datapackRoot) {
        // 内部なら確認
        const warningMessage = locale('create-datapack-template.inside-datapack', path.basename(datapackRoot));
        const result = await window.showWarningMessage(warningMessage,
            createMessageItemsHasId('yes'),
            createMessageItemsHasId('reselect'),
            createMessageItemsHasId('no')
        );
        if (result === undefined || result.id === 'no') return;
        if (result.id === 'reselect') return await createDatapack();
    }
    create(dir);
}

async function create(dir: Uri): Promise<void> {
    // データパック名入力
    const datapackName = await showInputBox(locale('create-datapack-template.datapack-name'), v => {
        const invalidChar = v.match(/[\\/:*?"<>|]/g);
        if (invalidChar) return locale('error.unexpected-character', invalidChar.join(', '));
    });
    if (datapackName === undefined) return;
    if (datapackName === '') {
        window.showErrorMessage(locale('create-datapack-template.name-blank'));
        return;
    }

    // データパック名の被りをチェック
    const datapackRoot = path.join(dir.fsPath, datapackName);
    if (await isDatapackRoot(datapackRoot)) {
        // 内部なら確認
        const warningMessage = locale('create-datapack-template.duplicate-datapack', path.basename(datapackRoot));
        const result = await window.showWarningMessage(warningMessage,
            createMessageItemsHasId('yes'),
            createMessageItemsHasId('rename'),
            createMessageItemsHasId('no')
        );
        if (result === undefined || result.id === 'no') return;
        if (result.id === 'rename') return create(dir);
    }

    // 説明入力
    const datapackDescription = await showInputBox(locale('create-datapack-template.datapack-description'));
    if (datapackDescription === undefined) return;

    // 名前空間入力
    const namespace = await showInputBox(locale('create-datapack-template.namespace-name'), v => {
        const invalidChar = v.match(/[^a-z0-9./_-]/g);
        if (invalidChar) return locale('error.unexpected-character', invalidChar.join(', '));
    });
    if (namespace === undefined) return;
    if (namespace === '') {
        window.showErrorMessage(locale('create-datapack-template.namespace-blank'));
        return;
    }

    const variableContainer: VariableContainer = {
        datapackName: datapackName,
        datapackDescription: datapackDescription,
        namespace: namespace,
        date: getDate()
    };

    // 生成するファイル/フォルダを選択
    const quickPickItems = getPickItems();
    quickPickItems.forEach(v => v.label = resolveVars(v.label, variableContainer));
    const createItems = await window.showQuickPick(quickPickItems, {
        canPickMany: true,
        ignoreFocusOut: true,
        matchOnDescription: false,
        matchOnDetail: false,
        placeHolder: locale('create-datapack-template.quickpick-placeholder')
    }).then(v => v?.flatPromise(async v2 => [...v2.generates, ...await v2.func?.() ?? []]));
    if (!createItems) return;

    createItems.push(getPackMcMetaData());
    const enconder = new TextEncoder();

    for (const item of createItems.filter(v => v.type === 'file')) {
        const filePath = path.join(dir.fsPath, datapackName, resolveVars(item.relativeFilePath, variableContainer));
        if (await file.pathAccessible(filePath)) continue;
        const resourcePath = getResourcePath(filePath, datapackRoot, getFileType(filePath, datapackRoot));
        const containerHasResourcePath = Object.assign({ resourcePath: resourcePath } as VariableContainer, variableContainer);
        const str = item.content?.map(v => resolveVars(v, containerHasResourcePath)).join('\r\n');
        await file.createFile(filePath, enconder.encode(str ?? ''));
    }
    for (const item of createItems.filter(v => v.type === 'folder')) {
        const filePath = path.join(dir.fsPath, datapackName, resolveVars(item.relativeFilePath, variableContainer));
        await file.createDir(filePath);
    }
    window.showInformationMessage(locale('create-datapack-template.complete'));
}