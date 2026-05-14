/**
 * Notes tab — private notes stored locally on device only
 * Uses AsyncStorage (never sent to server)
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Modal, Alert, ActivityIndicator,
  useColorScheme,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LockSimpleIcon, NoteIcon, PlusIcon, TrashIcon } from 'phosphor-react-native'
import { getTheme, type AppTheme } from '../../../src/lib/theme'

const NOTES_KEY = 'amoon:private-notes'

type Note = { id: string; text: string; updatedAt: number }

export default function NotesScreen() {
  const scheme = useColorScheme()
  const theme = getTheme(scheme)
  const styles = useMemo(() => createStyles(theme), [theme])
  const [notes,    setNotes]    = useState<Note[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState<Note | null>(null)
  const [editText, setEditText] = useState('')
  const [changed,  setChanged]  = useState(false)

  const loadNotes = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(NOTES_KEY)
      setNotes(raw ? JSON.parse(raw) : [])
    } catch { setNotes([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const saveNotes = async (list: Note[]) => {
    setNotes(list)
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(list))
  }

  const openNote = (note: Note) => {
    setEditing(note)
    setEditText(note.text)
    setChanged(false)
  }

  const newNote = async () => {
    const note: Note = { id: Date.now().toString(), text: '', updatedAt: Date.now() }
    const updated = [note, ...notes]
    await saveNotes(updated)
    openNote(note)
  }

  const saveNote = async () => {
    if (!editing) return
    const updated = notes.map(n => n.id === editing.id ? { ...n, text: editText, updatedAt: Date.now() } : n)
    await saveNotes(updated)
    setEditing(prev => prev ? { ...prev, text: editText, updatedAt: Date.now() } : null)
    setChanged(false)
  }

  const deleteNote = async (id: string) => {
    Alert.alert('Xóa ghi chú', 'Ghi chú này sẽ bị xóa vĩnh viễn.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        const updated = notes.filter(n => n.id !== id)
        await saveNotes(updated)
        if (editing?.id === id) setEditing(null)
      }},
    ])
  }

  const previewLine = (text: string) => text.split('\n')[0].trim() || 'Ghi chú trống'

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={scheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={theme.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Riêng tư · Chỉ lưu trên thiết bị</Text>
          <Text style={styles.headerTitle}>Ghi chú</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={newNote} activeOpacity={0.7}>
          <PlusIcon size={14} color={theme.accent} weight="bold" />
          <Text style={styles.addBtnTxt}>Mới</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <NoteIcon size={48} color={theme.faint} weight="duotone" />
              <Text style={styles.emptyTxt}>Chưa có ghi chú nào</Text>
              <Text style={styles.emptySub}>Ghi chú chỉ lưu trên thiết bị này — server không biết</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={newNote} activeOpacity={0.8}>
                <Text style={styles.emptyBtnTxt}>Tạo ghi chú đầu tiên</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }: { item: Note }) => (
            <TouchableOpacity style={styles.card} onPress={() => openNote(item)} activeOpacity={0.75} onLongPress={() => deleteNote(item.id)}>
              <Text style={styles.cardPreview} numberOfLines={5}>{item.text || 'Ghi chú trống'}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>{new Date(item.updatedAt).toLocaleDateString('vi')}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Editor modal */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => { if (changed) saveNote(); setEditing(null) }}>
        <SafeAreaView style={styles.editorRoot}>
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={() => { if (changed) saveNote(); setEditing(null) }} style={styles.editorBack}>
              <Text style={styles.editorBackTxt}>‹ Đóng</Text>
            </TouchableOpacity>
            <Text style={styles.editorStatus}>
              {changed ? '● Chưa lưu' : `Đã lưu ${new Date(editing?.updatedAt ?? 0).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' })}`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={saveNote} disabled={!changed} style={[styles.saveBtn, !changed && { opacity: 0.3 }]}>
                <Text style={styles.saveBtnTxt}>Lưu</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => editing && deleteNote(editing.id)} style={styles.deleteBtn}>
                <TrashIcon size={16} color="#EF4444" weight="bold" />
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={styles.editor}
            value={editText}
            onChangeText={t => { setEditText(t); setChanged(true) }}
            multiline
            autoFocus
            placeholder="Bắt đầu viết..."
            placeholderTextColor={theme.faint}
          />
          <View style={styles.editorFooter}>
            <View style={styles.editorLockRow}>
              <LockSimpleIcon size={13} color={theme.faint} weight="bold" />
              <Text style={styles.editorLock}>Riêng tư — không rời khỏi thiết bị này</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

function createStyles(theme: AppTheme) {
return StyleSheet.create({
  root:          { flex: 1, backgroundColor: theme.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerSub:     { color: theme.faint, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  headerTitle:   { color: theme.text, fontSize: 24, fontWeight: '800' },
  addBtn:        { backgroundColor: theme.accentSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addBtnTxt:     { color: theme.accent, fontSize: 13, fontWeight: '700' },
  card:          { flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 12, minHeight: 140, borderWidth: 1, borderColor: theme.border },
  cardPreview:   { color: theme.text, fontSize: 14, lineHeight: 20, flex: 1 },
  cardFooter:    { marginTop: 12 },
  cardDate:      { color: theme.faint, fontSize: 11 },
  empty:         { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTxt:      { color: theme.text, fontSize: 15, marginBottom: 8 },
  emptySub:      { color: theme.faint, fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  emptyBtn:      { backgroundColor: theme.accentSoft, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnTxt:   { color: theme.accent, fontSize: 14, fontWeight: '700' },
  editorRoot:    { flex: 1, backgroundColor: theme.bg },
  editorHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  editorBack:    { marginRight: 8 },
  editorBackTxt: { color: theme.accent, fontSize: 16 },
  editorStatus:  { flex: 1, color: theme.faint, fontSize: 12, textAlign: 'center' },
  saveBtn:       { backgroundColor: theme.accentSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  saveBtnTxt:    { color: theme.accent, fontSize: 13, fontWeight: '700' },
  deleteBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1A0A0A', alignItems: 'center', justifyContent: 'center' },
  editor:        { flex: 1, color: theme.text, fontSize: 16, lineHeight: 26, padding: 20, textAlignVertical: 'top' },
  editorFooter:  { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border },
  editorLockRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  editorLock:    { color: theme.faint, fontSize: 11, textAlign: 'center' },
})
}
