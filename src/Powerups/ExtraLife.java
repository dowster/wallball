/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Powerups;

import Game.PowerUp;
import Game.Game;
import java.awt.Graphics;
import java.awt.Point;

/**
 
 @author schmidmichae
 */
public class ExtraLife extends PowerUp
{
   
   public ExtraLife(Point location)
   {
      this.location = new Point(location);
      icon = ExtraLife.class.getResource("/res/powerupImages/ExtraLife.png");
   }
   
   @Override
   public void tick(Game game)
   {
      super.tick(game);   
   }

   @Override
   public void init(Game game)
   {
      player.addPlayerLife();
   }

   @Override
   public void end(Game game)
   {
   }

   @Override
   public void draw(Game game, Graphics w)
   {
      
   }
}
