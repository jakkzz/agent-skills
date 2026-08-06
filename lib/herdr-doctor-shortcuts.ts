export const SHORTCUTS = `# Herdr plugin shortcuts

## Herdr
- \`Cmd+G\` — เปิด/ปิด gitview
- \`Prefix E\` — เปิด/ปิด Neovim sidebar
- \`Prefix O\` — เลือกไฟล์ที่ agent เพิ่งแก้หรือกล่าวถึง

## gitview
- \`j / k\` — เลื่อนรายการไฟล์
- \`Enter\` — เปิดไฟล์ใน Neovim ตรงบรรทัดที่เปลี่ยน
- \`s\` — stage/unstage ไฟล์
- \`x\` — discard การแก้ไข (มีหน้าต่างยืนยัน)
- \`c\` — commit
- \`l\` — ดู commit history
- \`w\` — สลับ worktree/branch scope
- \`v\` แล้ว \`j/k\` — เลือกบรรทัด diff
- \`a\` — เพิ่ม review note
- \`p\` — ส่ง review notes ไปยัง agent
- \`?\` — เปิดความช่วยเหลือของ gitview

# Neovim quick reference

## Files and tree
- \`:Explore\` — เปิด file browser ในหน้าต่างปัจจุบัน
- \`:Lexplore\` — เปิด/ปิด file browser ด้านซ้าย
- \`:Vexplore\` — เปิด file browser แบบ vertical split
- \`:NERDTreeToggle\` — เปิด/ปิด NERDTree ถ้าติดตั้งไว้
- \`:e path/to/file\` — เปิดไฟล์
- \`:find filename\` — ค้นหาไฟล์จาก path
- \`:buffers\` และ \`:b N\` — ดูและสลับ buffer

## Windows and tabs
- \`:sp\` / \`:vsp\` — แบ่งหน้าต่างแนวนอน/แนวตั้ง
- \`Ctrl+W H/J/K/L\` — ย้ายหน้าต่างไปซ้าย/ล่าง/บน/ขวา
- \`Ctrl+W h/j/k/l\` — ย้ายโฟกัสระหว่างหน้าต่าง
- \`Ctrl+W =\` — ทำให้ทุกหน้าต่างมีขนาดเท่ากัน
- \`Ctrl+W _\` / \`Ctrl+W |\` — ขยายสูงสุด/กว้างสุด
- \`:tabnew\`, \`gt\`, \`gT\` — สร้างและสลับ tab
- \`:only\` — ปิดหน้าต่างอื่นทั้งหมด

## Advanced editing
- \`ciw\`, \`diw\`, \`yiw\` — เปลี่ยน/ลบ/คัดลอกคำใต้ cursor
- \`ci\"\`, \`di(\`, \`ya{\` — ใช้ text object ภายใน quote/วงเล็บ/ปีกกา
- \`f<char>\` / \`t<char>\` — กระโดดไปยัง/ก่อนตัวอักษรในบรรทัด
- \`;\` / \`,\` — ทำซ้ำ/ย้อนการค้นหาด้วย f หรือ t
- \`*\` / \`#\` — ค้นหาคำใต้ cursor ไปหน้า/ย้อนหลัง
- \`n\` / \`N\` — ผลการค้นหาถัดไป/ก่อนหน้า
- \`:%s/old/new/gc\` — replace ทั้งไฟล์พร้อมถามยืนยัน
- \`gv\` — เลือก visual selection ล่าสุดอีกครั้ง
- \`=ap\` — จัดย่อหน้าปัจจุบันให้ตรง indentation
- \`>ip\` / \`<ip\` — เพิ่ม/ลด indentation ของย่อหน้า
- \`J\` — รวมบรรทัด
- \`gJ\` — รวมบรรทัดโดยไม่เพิ่มช่องว่าง
- \`zz\` — จัดบรรทัดปัจจุบันไว้กลางจอ
- \`Ctrl+O\` / \`Ctrl+I\` — ย้อนกลับ/ไปข้างหน้าใน jump list
- \`qa\`, \`q\`, \`@a\`, \`@@\` — บันทึกและเล่น macro
- \`:earlier 5m\` / \`:later 5m\` — ย้อน/เดินหน้า undo ตามเวลา

## herdr-nvim annotations
- \`<leader>ac\` — comment บรรทัดหรือ selection
- \`<leader>al\` — ดูรายการ comments
- \`<leader>as\` — วาง comments ใน input ของ agent
- \`<leader>aS\` — ส่ง comments ให้ agent ทันที
`;
