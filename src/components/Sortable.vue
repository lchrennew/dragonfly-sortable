<script>
import Sortable from "../sortable/core/sortable.js";
import MultiDrag from "../sortable/plugins/multi-drag/index.js";
import { computed, inject, ref } from "vue";
import AutoScroll from "../sortable/plugins/auto-scroll/index.js";
import OnSpill from "../sortable/plugins/on-spill/index.js";

Sortable.mount(new MultiDrag(), new AutoScroll(), ...OnSpill)
const defaultSelection = ref({})

</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, provide, watchPostEffect, watchEffect } from "vue";
import SortableItem from "./SortableItem.vue";
import { insertNodeAt, removeNode, removeNodes, setIndices } from "./util/helper.js";

const props = defineProps({
    /**
     * 组名
     */
    groupName: { type: String, default: 'shared' },
    /**
     * 拖入规则
     * @example true 允许拖入
     * @example false 禁止拖入
     * @example ['group1', 'group2'] 允许从`group1`和`group2`拖入
     * @example (to, from) => from.el.children.length > 2 || 'clone'; 根据from和to动态调整
     */
    pullInFrom: { type: [ Boolean, Array, Function ], default: true },
    /**
     * 是否使用克隆拖入
     */
    pullClone: Boolean,
    /**
     * 拖出规则
     * @example true 允许拖出
     * @example false 禁止拖出
     * @example ['group1', 'group2'] 允许向`group1`和`group2`拖出
     * @example to =>  to.el.children.length < 4; 根据to动态调整
     */
    putOutTo: { type: [ Boolean, Array, Function ], default: true },

    // 渲染
    /**
     * 拖拽容器的渲染标签或容器组件
     */
    tag: { type: [ String, Object ], default: 'div' },
    itemTag: { type: [ String, Object ], default: 'div' },

    /**
     * 数据
     */
    value: {
        type: Array,
        required: true,
    },

    // 多选
    /**
     * 是否启用多项拖拽
     */
    multiple: Boolean,
    /**
     * 获取所选项的Key
     * @default 所选项数据本身
     */
    keyGetter: { type: Function, default: item => item },
    /**
     * 是否需要启用按键进行多选
     */
    selectionKey: Boolean,
    /**
     * 选中样式
     */
    selectedClass: String,


    /**
     * Sortable ID
     */
    id: { type: String, default: `Sortable-${ Date.now() }` },
    /**
     * 是否禁用拖拽
     */
    disabled: Boolean,
    /**
     * 是否禁止内部拖拽排序
     * @default false
     */
    noSort: { type: Boolean, default: false },
    /**
     * 是否启用动画效果
     */
    animation: Number,


    chosenClass: String,

    delay: Number,
    delayOnTouchOnly: Boolean,
    direction: String,
    dragClass: String,
    dragoverBubble: Boolean,
    easing: String,
    emptyInsertThreshold: Number,
    ghostClass: String,
    handle: String,
    ignoredWith: [ String, Function ],

})

const innerValue = ref([])

watchEffect(() => {
    innerValue.value = props.value
})

const emit = defineEmits([ 'update:value', 'change' ])
const el = ref()

const selection = inject('selection', defaultSelection)
const selected = key => key in selection.value
const select = key => selection.value[key] = true
const deselect = (...keys) => keys.forEach(key => delete selection.value[key])


let sortable

const group = computed(() => {
    const result = { pull: true, put: true }
    result.name = props.groupName || 'shared'
    if (!props.pullInFrom) result.pull = props.pullInFrom
    else if (props.pullClone) result.pull = 'clone'
    if (!props.putOutTo) result.put = props.putOutTo
    return result
})

provide('keyGetter', props.keyGetter)
provide('selected', selected)

let animationTimer
let stopWatchValue
let stopWatchOptions

const options = computed(() => ({
    group: group.value,
    sort: !props.noSort,
    delay: props.delay,
    delayOnTouchOnly: props.delayOnTouchOnly,
    touchStartThreshold: props.touchStartThreshold,
    disabled: props.disabled,
    animation: props.animation,
    easing: props.easing,
    handle: props.handle,
    filter: props.ignoredWith,
    preventOnFilter: props.preventOnIgnore,
    ghostClass: props.ghostClass,
    chosenClass: props.chosenClass,
    dragClass: props.dragClass,
    swapThreshold: props.swapThreshold,
    invertSwap: props.invertSwap,
    invertedSwapThreshold: props.invertedSwapThreshold,
    direction: props.direction,
    dragoverBubble: props.dragoverBubble,
    removeCloneOnHide: props.removeCloneOnHide,
    emptyInsertThreshold: props.emptyInsertThreshold,
    setData: props.setData,
    multiDrag: props.multiple,

}))

const exposeSortable = () =>
    el.value.sortableExposed = {
        id: computed(() => props.id),
        value: computed({ get: () => innerValue.value, set: value => emit('update:value', value) }),
        keyGetter: computed(() => props.keyGetter),
    };

const preventDefaultOnEnd = event => {
    if (event.indices?.length) {
        removeNodes(event.indices.map(i => i.multiDragElement))
        event.indices.forEach(i => insertNodeAt(i.from, i.multiDragElement, i.oldIndex))
        event.indices.forEach(i => Sortable.utils.deselect(i.multiDragElement))
    } else {
        removeNode(event.item)
        insertNodeAt(event.from, event.item, event.oldIndex)
    }
}

const onEnd = event => {
    const values = {}
    const changes = {}
    const tracks = []
    const to = event.to
    const toId = to.sortableExposed.id.value
    values[toId] ??= to.sortableExposed.value
    changes[toId] = []

    const extractTrack = (e, to) => {
        const { from, oldIndex: fromIndex, newIndex: toIndex } = e
        const fromId = from.sortableExposed.id.value
        values[fromId] ??= from.sortableExposed.value
        const keyGetter = from.sortableExposed.keyGetter.value
        const itemKey = keyGetter(values[fromId].value[fromIndex])
        const track = {
            item: itemKey,
            from: { id: fromId, index: fromIndex },
            to: { id: toId, index: toIndex }
        }
        tracks.push(track)

        if (from !== to) {
            changes[fromId] ??= []
            changes[fromId].push(track)
        }
        changes[toId].push(track)
    };

    if (event.indices?.length) event.indices.forEach(i => extractTrack(i, to))
    else extractTrack(event, to);

    const changeSet = Object.entries(changes).map(([ id, tracks ]) => {
        let items
        let sortedTracks = tracks.sort((a, b) => a.to.index - b.to.index);
        const indices = id === toId && sortedTracks.map(track => track.to.index)
        items = setIndices(
            values[id].value,
            sortedTracks.map(track => values[track.from.id].value[track.from.index]),
            indices)
        return { id, items }
    })

    animationTimer = setTimeout(() => {
        preventDefaultOnEnd(event)
        changeSet.forEach(({ id, items }) => values[id].value = items)
        emit('change', { tracks, changeSet })
    }, props.animation)

};
const onSelect = event => select(props.keyGetter(innerValue.value[event.newIndex]));
const onDeselect = event => deselect(props.keyGetter(innerValue.value[event.newIndex]));

onMounted(() => {


    exposeSortable();


    const opts = Object.assign({}, {
        avoidImplicitDeselect: true,
        multiDragKey: [ 'alt', 'meta', 'shift' ],
        selectedClass: 'selected',
        draggable: `>.sortable-item`,
        onEnd,
        onSelect,
        onDeselect,
    })

    sortable = new Sortable(el.value, opts)

    stopWatchValue = watchPostEffect(() => {
        innerValue.value.forEach((item, i) =>
            selected(props.keyGetter(item))
            && Sortable.utils.select(el.value.children[i]))
    })

    stopWatchOptions = watchEffect(() => sortable.setOptions(options.value))
})


onBeforeUnmount(() => {
    clearTimeout(animationTimer)
    delete el.value.sortableExposed
    sortable.destroy()
    deselect(...innerValue.value)
    stopWatchValue?.()
    stopWatchOptions?.()

})

</script>

<template>
    <component :is="tag" ref="el">
        <sortable-item
            v-for="item in innerValue"
            :tag="itemTag"
            :item="item"
            :selected="selection[keyGetter(item)]"
        >
            <slot v-bind="{item}"/>
        </sortable-item>
    </component>
</template>

<style scoped>

</style>