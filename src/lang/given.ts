import { BUNDLES } from '../names/bundles';

/** Given names and family names by template, for languages that keep their template's names (respelled by their sound changes). */

export const GIVEN: Record<string, [string[], string[]]> = {
  anglo: [
    [
      'Edric', 'Aldous', 'Godwin', 'Osric', 'Wulfstan', 'Edmund', 'Harold', 'Leofric', 'Aelfred', 'Cuthbert', 
      'Oswin', 'Wilfred', 'Edgar', 'Raynald', 'Gilbert', 'Roger', 'Walter', 'Hugh', 'Stephen', 'Geoffrey', 
      'Henry', 'Richard', 'Simon', 'Robert', 'Thomas', 'Alaric', 'Aethelred', 'Hereward', 'Eadwig', 'Aethelstan', 
      'Bardolf', 'Kenelm', 'Everard', 'Giles', 'Fulke', 'Rannulf', 'Godric', 'Wymond', 'Osbert', 'Waltheof', 
      'Peverel', 'Hamund', 'Bertram', 'Dunstan', 'Jocelyn', 'Anketil', 'Hamon', 'Warnebald', 'Eustace', 'Marmaduke'
    ],
    [
      'Aethelflaed', 'Edith', 'Godiva', 'Mildred', 'Hilda', 'Matilda', 'Eleanor', 'Margery', 'Rowena', 'Isabel', 
      'Alys', 'Joan', 'Agnes', 'Cecily', 'Maud', 'Elfrida', 'Winifred', 'Ermengarde', 'Beatrice', 'Rosamund', 
      'Eadgyth', 'Aethelthryth', 'Sybil', 'Hawise', 'Idonea', 'Clarice', 'Avice', 'Millicent', 'Gillian', 'Rohesia', 
      'Basilia', 'Helewise', 'Lecelina', 'Gunnora', 'Philippa', 'Avis', 'Eothend', 'Aelgifu', 'Richenda', 'Lettice'
    ],
  ],
  norse: [
    [
      'Ragnar', 'Harald', 'Sigurd', 'Bjorn', 'Eirik', 'Olaf', 'Halfdan', 'Ivar', 'Thorvald', 'Gunnar', 
      'Ulf', 'Sven', 'Knut', 'Hakon', 'Sverre', 'Arnulf', 'Ketil', 'Thorgrim', 'Vemund', 'Asmund', 
      'Orm', 'Hrolf', 'Torstein', 'Egil', 'Leif', 'Styrkar', 'Gorm', 'Brand', 'Erling', 'Skarde', 
      'Thorbjorn', 'Hallfred', 'Bersi', 'Ottar', 'Geir', 'Ingolf', 'Kari', 'Snorri', 'Vestar', 'Tryggvi', 
      'Valgard', 'Sighvat', 'Hraenar', 'Runolf', 'Thrain', 'Einar', 'Arne', 'Bard', 'Gudmund', 'Jorund'
    ],
    [
      'Astrid', 'Sigrid', 'Ingrid', 'Gunnhild', 'Thyra', 'Ragnhild', 'Freydis', 'Helga', 'Ylva', 'Aslaug', 
      'Thora', 'Gudrun', 'Signy', 'Hallveig', 'Ingeborg', 'Solveig', 'Brynja', 'Ragna', 'Torhild', 'Thordis', 
      'Gudrid', 'Osk', 'Aud', 'Hildur', 'Dalla', 'Finna', 'Svanhild', 'Jorunn', 'Aesa', 'Kora', 
      'Vigdris', 'Eldrid', 'Rannveig', 'Herdis', 'Bera', 'Ingibjorg', 'Valgerd', 'Greta', 'Lif', 'Asta'
    ],
  ],
  latin: [
    [
      'Aurelian', 'Marcellus', 'Lucan', 'Cassian', 'Valerian', 'Octavian', 'Severin', 'Lucius', 'Florian', 'Corvin', 
      'Tiberio', 'Matteo', 'Lorenzo', 'Alessandro', 'Federico', 'Cosimo', 'Ottavio', 'Gaius', 'Decimus', 'Sabinus', 
      'Ambrose', 'Vitale', 'Fabrizio', 'Rinaldo', 'Aetius', 'Flavius', 'Titus', 'Tacitus', 'Valerius', 'Claudian', 
      'Magnus', 'Vespasius', 'Silvanus', 'Maximian', 'Sergius', 'Caius', 'Hadrian', 'Aemilius', 'Julian', 'Cornelius', 
      'Constantine', 'Belisarius', 'Domitian', 'Narses', 'Gennaro', 'Niccolo', 'Bartolomeo', 'Jacopo', 'Valerio', 'Uberto'
    ],
    [
      'Aurelia', 'Livia', 'Julia', 'Octavia', 'Valeria', 'Flavia', 'Lucrezia', 'Isotta', 'Beatrice', 'Caterina', 
      'Bianca', 'Costanza', 'Giulia', 'Serafina', 'Claudia', 'Drusilla', 'Lavinia', 'Ottavia', 'Cornelia', 'Lucilla', 
      'Sabina', 'Marcella', 'Faustina', 'Domitia', 'Antonia', 'Camilla', 'Gaienne', 'Agripina', 'Violante', 'Ginevra', 
      'Simonetta', 'Alessandra', 'Eleonora', 'Maddalena', 'Francesca', 'Fiammetta', 'Zenobia', 'Porcia', 'Tullia', 'Flaminia'
    ],
  ],
  celtic: [
    [
      'Brannoc', 'Cormac', 'Fergus', 'Conall', 'Niall', 'Domnall', 'Aedan', 'Cathal', 'Ruadh', 'Owain', 
      'Gruffydd', 'Rhodri', 'Cadwal', 'Brennus', 'Eochaid', 'Lugaid', 'Tadhg', 'Dyfnwal', 'Maelgwn', 'Ciaran', 
      'Uisdean', 'Morcant', 'Oisin', 'Diarmuid', 'Lorcán', 'Cynan', 'Iorwerth', 'Caradog', 'Maelcoluim', 'Fiachra', 
      'Artur', 'Murchad', 'Donnchad', 'Finlay', 'Bhaltair', 'Cináed', 'Padrig', 'Bedwyr', 'Gwilym', 'Gareth', 
      'Diarmaid', 'Llewellyn', 'Mabon', 'Macsen', 'Gideon', 'Bran', 'Breasal', 'Eachann', 'Dónal', 'Sweeney'
    ],
    [
      'Brigid', 'Aoife', 'Niamh', 'Deirdre', 'Gwenllian', 'Rhiannon', 'Morrigan', 'Eithne', 'Sorcha', 'Una', 
      'Nest', 'Angharad', 'Medb', 'Grainne', 'Cerys', 'Fionnuala', 'Branwen', 'Ailbhe', 'Sadhbh', 'Róisín', 
      'Dearbhla', 'Mairead', 'Elen', 'Blodeuwedd', 'Sian', 'Heledd', 'Caitlín', 'Finnguala', 'Muirenn', 'Fedelma', 
      'Caitriona', 'Eilidh', 'Gormlaith', 'Emer', 'Catrin', 'Olwen', 'Eira', 'Elora', 'Siobhán', 'Sinead'
    ],
  ],
  elvish: [
    [
      'Aelindor', 'Thalion', 'Caladrel', 'Faelar', 'Ithilmar', 'Elrion', 'Saelith', 'Arandil', 'Galathir', 'Lorimel', 
      'Merethil', 'Silvaran', 'Taurendil', 'Ylvarin', 'Caelborn', 'Erevan', 'Aerandir', 'Vaelis', 'Finrael', 'Oreluin', 
      'Celegorm', 'Eärendil', 'Fëanor', 'Voronwë', 'Amras', 'Haldir', 'Legolas', 'Aegnor', 'Gildor', 'Ingwë', 
      'Maedhros', 'Lindir', 'Rilvan', 'Oropher', 'Elros', 'Círdan', 'Valandil', 'Celebrimbor', 'Galdor', 'Theron'
    ],
    [
      'Aelinwe', 'Ithilsa', 'Lirael', 'Nimriel', 'Sylvara', 'Taelis', 'Elanwe', 'Aerwyn', 'Caelith', 'Mirael', 
      'Galadis', 'Nerys', 'Faelith', 'Ilmara', 'Vaelra', 'Eirwen', 'Lusiel', 'Amaris', 'Galadriel', 'Arwen', 
      'Idril', 'Lúthien', 'Celebrían', 'Aredhel', 'Míriel', 'Finduilas', 'Nellas', 'Melian', 'Anárion', 'Nimloth', 
      'Elenna', 'Vána', 'Silmariel', 'Laurelin', 'Eirien', 'Nariel', 'Elora', 'Rilwen', 'Tariel', 'Yavanna'
    ],
  ],
  desert: [
    [
      'Harun', 'Yusuf', 'Rashid', 'Tariq', 'Faisal', 'Khalid', 'Mansur', 'Nasir', 'Salah', 'Zahir', 
      'Hamid', 'Idris', 'Jafar', 'Malik', 'Qasim', 'Rafiq', 'Suleiman', 'Walid', 'Yazid', 'Murad', 
      'Kamal', 'Bahram', 'Selim', 'Hakim', 'Faruq', 'Bilal', 'Imran', 'Mustafa', 'Nabil', 'Osman', 
      'Hamza', 'Habib', 'Abbas', 'Ziyad', 'Sami', 'Hassan', 'Hussein', 'Asad', 'Danish', 'Faris', 
      'Latif', 'Suhail', 'Ma\'mun', 'Barakat', 'Nizar', 'Taimur', 'Rida', 'Jalal', 'Shakir', 'Ghiyas'
    ],
    [
      'Zubaida', 'Fatima', 'Layla', 'Yasmin', 'Shirin', 'Amira', 'Nadira', 'Samira', 'Zahra', 'Khadija', 
      'Aisha', 'Rania', 'Soraya', 'Parisa', 'Jamila', 'Mahsa', 'Dunya', 'Safiya', 'Halima', 'Roxana', 
      'Aziza', 'Amina', 'Nour', 'Laila', 'Shadia', 'Habiba', 'Zulaykha', 'Inas', 'Badria', 'Sahar', 
      'Mariam', 'Hind', 'Asma', 'Dalia', 'Farida', 'Najwa', 'Reem', 'Tahira', 'Huda', 'Wafa'
    ],
  ],
  slavic: [
    [
      'Mstislav', 'Yaroslav', 'Vladimir', 'Sviatoslav', 'Boleslav', 'Vsevolod', 'Rostislav', 'Izyaslav', 'Dobrynya', 'Bogdan', 
      'Casimir', 'Vratislav', 'Zbigniew', 'Radomir', 'Stanimir', 'Borislav', 'Miroslav', 'Lyubomir', 'Svetopolk', 'Dragomir', 
      'Vyacheslav', 'Gleb', 'Igor', 'Oleg', 'Premysl', 'Wladyslaw', 'Kazimierz', 'Jaromir', 'Leszek', 'Mezadir', 
      'Branislav', 'Sudislav', 'Radoslav', 'Velimir', 'Vojtech', 'Ratibor', 'Miloslav', 'Dushi', 'Stanislav', 'Blagoy', 
      'Tichomir', 'Vecheslav', 'Boledar', 'Cestmir', 'Kresimir', 'Svetozar', 'Zdenek', 'Zlatko', 'Vladislav', 'Goran'
    ],
    [
      'Olga', 'Lyudmila', 'Dobrava', 'Rogneda', 'Zoria', 'Milena', 'Vesna', 'Dragomira', 'Svetlana', 'Bozena', 
      'Radmila', 'Zlata', 'Miroslava', 'Yaroslava', 'Desislava', 'Kseniya', 'Libusa', 'Wanda', 'Svetlana', 'Danica', 
      'Svyatoslava', 'Bogdana', 'Stanislava', 'Milica', 'Zdenka', 'Radoslava', 'Daria', 'Vlada', 'Jadwiga', 'Kinga', 
      'Kazimiera', 'Boleslawa', 'Miloslava', 'Premyslava', 'Vjera', 'Slavica', 'Branislava', 'Svetozara', 'Marzena', 'Mira'
    ],
  ],
  dwarven: [
    [
      'Thrand', 'Borin', 'Durgan', 'Baldrek', 'Gromli', 'Hargrim', 'Korin', 'Murdin', 'Nordri', 'Orsik', 
      'Rurik', 'Thordak', 'Ulfgar', 'Vondal', 'Brundar', 'Dagnal', 'Frar', 'Gimlur', 'Harbek', 'Kildrak', 
      'Morgran', 'Torvek', 'Thorin', 'Balin', 'Dwalin', 'Gloin', 'Oin', 'Bifur', 'Bofur', 'Bombur', 
      'Dain', 'Thror', 'Fundin', 'Kili', 'Fili', 'Nali', 'Narvi', 'Garmur', 'Durnir', 'Brimir', 
      'Brokk', 'Eitri', 'Sindri', 'Dvalin', 'Thorgrun', 'Kazadur', 'Kragur', 'Strakeln', 'Barundar', 'Balthor'
    ],
    [
      'Dagny', 'Helja', 'Kathra', 'Mardred', 'Riswynn', 'Torbera', 'Vistra', 'Amber', 'Bardryn', 'Dis', 
      'Eldeth', 'Gunnloda', 'Hlin', 'Liftrasa', 'Sannl', 'Torgga', 'Gurdis', 'Ilde', 'Kristryd', 'Kila', 
      'Nalred', 'Tamok', 'Kragra', 'Tordis', 'Dwanil', 'Finellen', 'Vondra', 'Brakka', 'Gimra', 'Throra', 
      'Kora', 'Runnal', 'Tasma', 'Audhild', 'Freyde', 'Brida', 'Hulda', 'Loda', 'Skadi', 'Thora'
    ],
  ],
  southern: [
    [
      'Andronikos', 'Basil', 'Nikephoros', 'Alexios', 'Theodoros', 'Manuel', 'Konstantinos', 'Leon', 'Demetrios', 'Isaakios', 
      'Michael', 'Stephanos', 'Kallias', 'Lysander', 'Perikles', 'Timon', 'Kleon', 'Philon', 'Xenon', 'Agathon', 
      'Nikandros', 'Ioannes', 'Komnenos', 'Doukas', 'Laskaris', 'Palaiologos', 'Georgios', 'Stavros', 'Constantinos', 'Anastasios', 
      'Eustathios', 'Bartholomaios', 'Niketas', 'Christopher', 'Gennadios', 'Spyridon', 'Christodoulos', 'Polykarpos', 'Ignatios', 'Pantoleon', 
      'Symeon', 'Cosmas', 'Damian', 'Philotheos', 'Tarchaneiotes', 'Phokas', 'Romanos', 'Skleros', 'Taronites', 'Votaneiates'
    ],
    [
      'Theodora', 'Irene', 'Zoe', 'Anna', 'Eudokia', 'Helena', 'Sophia', 'Thekla', 'Kassia', 'Theophano', 
      'Maria', 'Kallisto', 'Phaedra', 'Xanthe', 'Aspasia', 'Damaris', 'Lysandra', 'Eirene', 'Ariadne', 'Euphrosyne', 
      'Pulcheria', 'Marina', 'Catherine', 'Melania', 'Agatha', 'Pelagia', 'Barbara', 'Christina', 'Paraskevi', 'Styliani', 
      'Despoina', 'Evdokia', 'Glykeria', 'Kallirhoe', 'Polyxeni', 'Kassandra', 'Evgenia', 'Thalia', 'Athenais', 'Sebasteia'
    ],
  ],
  steppe: [
    [
      'Temur', 'Batu', 'Ogedai', 'Toghrul', 'Arslan', 'Kaidu', 'Mongke', 'Jochi', 'Berke', 'Subutai', 
      'Tolui', 'Khubil', 'Esen', 'Altan', 'Bayan', 'Chagan', 'Nogai', 'Orda', 'Tarkhan', 'Yesugei', 
      'Khutula', 'Qutlugh', 'Chagatai', 'Hulagu', 'Arik', 'Burchi', 'Kassar', 'Jalair', 'Abaqa', 'Tekuder', 
      'Tokhtamysh', 'Mamai', 'Tamerlane', 'Inalchuk', 'Sartaq', 'Qara', 'Kormichi', 'Dayir', 'Guchu', 'Muqali', 
      'Jebe', 'Koke', 'Korumshi', 'Saban', 'Ulagchi', 'Tode', 'Chormaqan', 'Baiju', 'Boroldai', 'Eljigidey'
    ],
    [
      'Borte', 'Sorghaghtani', 'Khutulun', 'Oghul', 'Toregene', 'Alaqai', 'Mandukhai', 'Chabi', 'Hoelun', 'Ebegei', 
      'Altani', 'Checheyigen', 'Yesui', 'Kokochin', 'Saran', 'Tuyaa', 'Erdene', 'Naran', 'Yesugen', 'Ibaka', 
      'Arughan', 'Tegulen', 'Qutui', 'Doquz', 'Bayan', 'Bulugan', 'Nogai', 'Altai', 'Tsetseg', 'Enkhtuyaa', 
      'Bolormaa', 'Goyot', 'Oyuun', 'Solongo', 'Bayarmaa', 'Khulan', 'Monguljin', 'Aytana', 'Tengri', 'Narantuyaa'
    ],
  ],
  jungle: [
    [
      'Itzcoatl', 'Kinich', 'Yaxun', 'Chak', 'Balam', 'Tepeu', 'Xocoyotl', 'Ahuitzotl', 'Kukul', 'Yuknoom', 
      'Pakal', 'Huemac', 'Cuauhtli', 'Tizoc', 'Xiuhtecatl', 'Ixtli', 'Kan', 'Ozomatli', 'Uxmal', 'Tlaloc', 
      'Cuitlahuac', 'Moctezuma', 'Maxtla', 'Nezahualcoyotl', 'Nezahualpilli', 'Totoquihuaztli', 'Chimalpopoca', 'Acamapichtli', 'Huitzilihuitl', 'Axayacatl', 
      'Kak Tiliw', 'Siyaj K\'ak', 'Bird Jaguar', 'Shield Jaguar', 'Hasaw Chan', 'Yax Ehb', 'Spearthrower Owl', 'Smoke Imix', 'Fire Is Born', 'Sun K\'inich'
    ],
    [
      'Ixchel', 'Xochitl', 'Ixtab', 'Citlali', 'Itzel', 'Yaretzi', 'Nicte', 'Sac', 'Zazil', 'Atziri', 
      'Tonantzin', 'Xiadani', 'Ameyali', 'Coatl', 'Malinalli', 'Necahual', 'Quetzalli', 'Yolotli', 'Lady Six Sky', 'Lady Xoc', 
      'Lady K\'abel', 'Lady Mutal', 'Lady B\'alaj', 'Lady Wak', 'Lady Yohl', 'Lady Chak', 'Lady Zutuil', 'Atotoztli', 'Tecuichpo', 'Cihuacoatl', 
      'Coatlicue', 'Chalmecacihuatl', 'Chantico', 'Mayahuel', 'Tlazolteotl', 'Huihtaca', 'Iztaccihuatl', 'Matlalcueye', 'Chalchiuhtlicue', 'Xilonen'
    ],
  ],
  sinic: [
    [
      'Wen', 'Jian', 'Zhen', 'Hong', 'Rui', 'Xuan', 'Yong', 'Tai', 'Shen', 'Long', 
      'Ming', 'Kang', 'Heng', 'Jun', 'Qian', 'Zhao', 'Wei', 'Cheng', 'Shao', 'Yuan', 
      'Feng', 'Huai', 'Bo', 'Chao', 'Guang', 'Hao', 'Jing', 'Lei', 'Peng', 'Song', 
      'Tao', 'Xiang', 'Yang', 'Yi', 'Zhi', 'Zhong', 'Bao', 'De', 'Dong', 'Guo', 
      'Han', 'Lian', 'Liang', 'Sheng', 'Shu', 'Tian', 'Xian', 'Zhe', 'Zhi', 'Zhuo'
    ],
    [
      'Lian', 'Mei', 'Hua', 'Yu', 'Xiu', 'Lan', 'Zhu', 'Jing', 'Ying', 'Qiao', 
      'Rong', 'Shu', 'Xia', 'Yan', 'Ling', 'Fen', 'Hui', 'Zhen', 'An', 'Bao', 
      'Chun', 'Fang', 'Gui', 'Hong', 'Jia', 'Ju', 'Liling', 'Min', 'Ning', 'Ping', 
      'Qing', 'Ru', 'Shuang', 'Ting', 'Xiang', 'Xue', 'Ya', 'Yue', 'Yun', 'Zhi', 
      'Zhen', 'Fei', 'Jiao', 'Lu', 'Niu', 'Pei', 'Shan', 'Ting', 'Wan', 'Xian'
    ],
  ],
  japonic: [
    [
      'Harunobu', 'Kagetora', 'Masamune', 'Nobuhide', 'Takauji', 'Yoshitsune', 'Kiyomori', 'Ujimasa', 'Terumoto', 'Motonari', 
      'Hidetada', 'Ietsuna', 'Katsuyori', 'Mitsuhide', 'Nagamasa', 'Sadamori', 'Tadakatsu', 'Yorimasa', 'Kanetsugu', 'Toshiie', 
      'Nobunaga', 'Ieyasu', 'Hideyoshi', 'Shingen', 'Kenshin', 'Masayuki', 'Yukimura', 'Yoshitsugu', 'Ujiyasu', 'Muneshige', 
      'Miyamoto', 'Sakon', 'Ranmaru', 'Naomasa', 'Yasumasa', 'Kagekatsu', 'Katsuie', 'Nagahide', 'Kazumasu', 'Mitsunari', 
      'Ujisato', 'Hideaki', 'Kiyomasa', 'Masanori', 'Yoshitaka', 'Tadamasa', 'Tadatsugu', 'Mochitora', 'Norisada', 'Tameyoshi'
    ],
    [
      'Tomoe', 'Nene', 'Oichi', 'Kasuga', 'Masako', 'Hisako', 'Chiyo', 'Ginchiyo', 'Kiyohime', 'Murasaki', 
      'Sakura', 'Akiko', 'Haru', 'Yodo', 'Teruko', 'Fusako', 'Sen', 'Komatsu', 'Nohime', 'Aya', 
      'Naotora', 'Gotoku', 'Tachibana', 'Sena', 'Kasa', 'Yuki', 'Tshedo', 'Izumi', 'Katsuko', 'Sayo', 
      'Tama', 'Matsu', 'Kaede', 'Kiku', 'Ume', 'Ina', 'Gou', 'Daimyo', 'Suwo', 'Ren'
    ],
  ],
  koreanic: [
    [
      'Seon', 'Jun', 'Hwan', 'Taejo', 'Wang', 'Myeong', 'Gyeong', 'Hyeon', 'Seok', 'Yong', 
      'Jeong', 'Cheol', 'Ho', 'Min', 'Sung', 'Jin', 'Hyeok', 'Taek', 'Kwang', 'Il', 
      'Gwanggaeto', 'Sejong', 'Eulji', 'Gim', 'Yi', 'Chae', 'Gang', 'Ryu', 'Jang', 'Song', 
      'Yun', 'Choe', 'Suh', 'Bae', 'Goo', 'Gyu', 'Beom', 'Sang', 'Won', 'Woo', 
      'Dae', 'Dong', 'Do', 'Chan', 'Geon', 'Ha', 'Hyun', 'Jae', 'Seung', 'Kyung'
    ],
    [
      'Seonhwa', 'Myeongseong', 'Deokman', 'Jindeok', 'Hyeon', 'Sunjeong', 'Yeong', 'Mi', 'Jiwon', 'Haeun', 
      'Soyeon', 'Eunbi', 'Hwaseon', 'Nari', 'Sora', 'Yuna', 'Bora', 'Ara', 'Inhyeon', 'Janghui', 
      'Sindo', 'Wongyeong', 'Insu', 'Ansun', 'Jeonghyun', 'Munjeong', 'Insun', 'Inwon', 'Jeongsun', 'Sunwon', 
      'Inryeong', 'Hyegyeong', 'Danui', 'Seonui', 'Myeongui', 'Geum', 'Chae', 'Aeri', 'Eun', 'Min'
    ],
  ],
  woodland: [
    [
      'Grey Owl', 'Black Hawk', 'Red Cloud', 'Running Elk', 'Two Rivers', 'Tall Pine', 'Swift Otter', 'Stands-in-Fire', 
      'White Bear', 'Thunder Voice', 'Lone Wolf', 'Many Horses', 'Quiet Fox', 'Iron Shell', 'Broken Bow', 'Far Walker', 
      'Sitting Bull', 'Crazy Horse', 'Tecumseh', 'Geronimo', 'Cochise', 'Pontiac', 'Osceola', 'Red Jacket', 'Little Turtle', 
      'Ten Bears', 'Gall', 'Spotted Tail', 'Rain-in-the-Face', 'Crow Dog', 'Kicking Bear', 'American Horse', 'Two Strike', 
      'Chief Joseph', 'White Antelope', 'Left Hand', 'Black Kettle', 'Roman Nose', 'Duluth', 'Brave Bear'
    ],
    [
      'Morning Star', 'Bright Water', 'White Doe', 'Singing Wind', 'Blue Heron', 'Little Dove', 'Falling Leaf', 'Moon Rising', 
      'Sweet Grass', 'Red Willow', 'Spotted Fawn', 'Snow Bird', 'Laughing Brook', 'Wild Rose', 'Dawn Light', 'Corn Tassel', 
      'Sacagawea', 'Pocahontas', 'Lozen', 'Dahteste', 'Pine Leaf', 'Buffalo Calf Road', 'Pretty Nose', 'Running Eagle', 
      'Moving Robe', 'Minnehaha', 'Golden Rod', 'Silver Willow', 'Sun Flower', 'Cloud Dancer', 'Whispering Pines', 'Star Flower', 
      'Winter Moon', 'Summer Rain', 'Spring Blossom', 'Autumn Sky', 'Quiet Lake', 'Dancing Feather', 'Soft Breeze', 'Gentle Rain'
    ],
  ],
  highland: [
    [
      'Huaman', 'Inti', 'Pachac', 'Tupac', 'Yupanqui', 'Atoc', 'Cusi', 'Mayta', 'Sinchi', 'Capac', 
      'Amaru', 'Huascar', 'Rumi', 'Wiraq', 'Achachi', 'Paullu', 'Sayri', 'Titu', 'Urco', 'Waman', 
      'Pachacuti', 'Viracocha', 'Lloque', 'Manco', 'Apu', 'Chalcuchima', 'Quizquiz', 'Rumiñahui', 'Vilca', 'Huayna', 
      'Auqui', 'Tito', 'Illapa', 'Mallku', 'Kuntur', 'Anka', 'Catari', 'Puma', 'Uturuncu', 'Yawar'
    ],
    [
      'Ocllo', 'Quilla', 'Chaska', 'Coya', 'Sisa', 'Mama', 'Rawa', 'Killa', 'Tika', 'Yupay', 
      'Cusi', 'Ima', 'Pacha', 'Sumaq', 'Waylla', 'Kantu', 'Nina', 'Uchu', 'Chimpu', 'Rawa', 
      'Micay', 'Anahuarque', 'Chungui', 'Curi', 'Pillku', 'Kori', 'Urpi', 'Tamya', 'Sonqo', 'Aklla', 
      'Iskra', 'Tiyana', 'Kushi', 'Illari', 'Allpa', 'Asiriy', 'Kukuli', 'Hawka', 'Mallki', 'Nizam'
    ],
  ],
};
for (const b of BUNDLES) GIVEN[b.culture.id] = b.given;


export const SINIC_FAMILY = ['Li', 'Zhao', 'Wang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Gao', 'Luo', 'Song', 'Han', 'Tang', 'Feng', 'Cao', 'Xiao', 'Deng'];
export const KOREANIC_FAMILY = ['Kim', 'Yi', 'Pak', 'Choe', 'Jeong', 'Kang', 'Jo', 'Yun', 'Jang', 'Im', 'Han', 'Shin', 'Seo', 'Gwon', 'Hwang', 'Ahn', 'Song', 'Yu', 'Hong', 'Jeon'];
export const JAPONIC_A = ['Taka', 'Masa', 'Naga', 'Hosa', 'Ota', 'Mina', 'Hata', 'Asa', 'Kuro', 'Shima', 'Mori', 'Kita', 'Ima', 'Oda', 'Toku', 'Uesu', 'Sana', 'Hoji', 'Kiyo', 'Fuji'];
export const JAPONIC_B = ['da', 'kawa', 'moto', 'mura', 'gawa', 'zu', 'yama', 'hara', 'sugi', 'no', 'ta', 'saki', 'hashi', 'mori', 'naga', 'jo'];
