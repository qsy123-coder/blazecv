import sharp from "sharp";
await sharp("C:/Users/WINDOWS11/AppData/Local/Temp/audit-one.png").resize(720,1019,{fit:"fill"}).toFile("C:/Users/WINDOWS11/AppData/Local/Temp/audit-one-720.png");
