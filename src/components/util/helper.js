/**
 *
 * @param array
 * @param items
 * @param indices {Array|Number?}
 * @returns {*}
 */
export const setIndices = (array, items, indices) => {
    const excluded = array.filter(item => !items.includes(item))
    Number.isInteger(indices) && indices >= 0 && excluded.splice(indices, 0, ...items)
    Array.isArray(indices) && indices?.forEach((index, i) => ~(index ?? -1) && excluded.splice(index, 0, items[i]))
    return excluded
}

export const removeNode = node => node.parentElement?.removeChild(node);
export const removeNodes = nodes => nodes.forEach(removeNode)
export const insertNodeAt = (fatherNode, node, position) => {
    const refNode =
        position === 0
            ? fatherNode.children[0]
            : fatherNode.children[position - 1].nextSibling
    fatherNode.insertBefore(node, refNode)
}

